var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

import React from 'react';

export const ComponentType = Symbol('Component');
export const StoreType = Symbol('Store');
const defaultPropMapper = x => x;
const defaultPayloadFactory = (context, firstArg) => firstArg;
const dummyState = {};
const unsafeSetState = Symbol('SetState');
const unsafeUpdate = Symbol('Update');
const isDispatcher = Symbol('Dispatcher');
const isAction = Symbol('Action');
const ignore = Symbol('Ignore');
const noop = () => undefined;
let subscriptionUniqueId = 1;

export function create(factory, ...describers) {
  return factory(describers);
}

export function update(target, ...describers) {
  if (unsafeUpdate in target) {
    return target[unsafeUpdate](describers);
  }
  throw new Error('Target object does not support update');
}

/**
 * create a store
 */
export function store(initialState) {
  return function (describers) {
    const reducers = [];
    const subscriptions = [];
    const computedProps = [];
    const linkedProps = [];
    const middlewares = [];
    const stores = [];
    const initMethods = {};

    let currentState = initialState;
    let updatingProps = false;
    let store;

    function recompute() {
      const prevState = currentState;
      const descriptionContext = {
        ownedProps: currentState
      };
      for (let [name, evaluator, computer] of computedProps) {
        const nextValue = computer.apply(null, evaluator(descriptionContext));

        if (nextValue !== currentState[name]) {
          if (currentState === prevState) {
            currentState = _extends({}, currentState);
          }

          currentState[name] = nextValue;
        }
      }
    }

    function addReducer(reducer) {
      reducers.push(reducer);
    }

    function addStore(store) {
      stores.push(store);
    }

    function addMiddleware(middleware) {
      middlewares.unshift(middleware);
    }

    function getState() {
      return currentState;
    }

    function updateLinkedProps() {
      if (linkedProps.length) {
        if (updatingProps) return;
        try {
          for (let [destProp, store, sourceProp] of linkedProps) {
            const nextValue = currentState[destProp];
            const prevValue = !sourceProp ? store.getState() : store.getState()[sourceProp];
            // update source store
            if (nextValue !== prevValue) {
              if (!sourceProp) {
                store[unsafeSetState](nextValue);
              } else {
                store[unsafeSetState](_extends({}, store.getState(), {
                  [sourceProp]: nextValue
                }));
              }
            }
          }
        } finally {
          updatingProps = false;
        }
      }
    }

    function setState(nextState) {
      if (nextState === currentState) return;
      currentState = nextState;
      updateLinkedProps();
      // re-compute
      recompute();

      notify();
    }

    function addProperty(name, descriptor, map, options) {
      if (typeof map !== 'function' && map !== false) {
        // create linked prop
        if (!stores.length) {
          throw new Error('At least store required to create linked prop');
        } else if (stores.length > 1) {
          throw new Error('Linked prop requires only a store');
        }
        linkedProps.push([name, stores[0], map, options]);
        stores.length = 0;
      } else if (descriptor[isAction]) {
        const action = descriptor;
        const dispatcher = Object.assign(payload => {
          store.dispatch(action, payload);
        }, {
          [StoreType]: getStore
        });

        if (store) {
          if (name in store) {
            // overwrite existing method is not allowed
          } else {
            store[name] = dispatcher;
          }
        } else {
          initMethods[name] = dispatcher;
        }
      } else {
        computedProps.push([name, descriptor, selector(map), options]);
      }
    }

    function dispatch(action, payload) {
      let actionResult = action(payload);
      if (typeof actionResult === 'function') {
        actionResult = actionResult(currentState);
        if (typeof actionResult === 'function') {
          actionResult = actionResult(dispatch, getState);
          return actionResult;
        } else {
          // new state
          if (actionResult && typeof actionResult.then === 'function') {
            return actionResult.then(setState);
          } else {
            setState(actionResult);
          }
        }
      } else {
        // action creator result
        // call middlewares and reducers
        const pendingDispatchings = [];
        const prevState = currentState;
        currentState = middlewares.reduce((next, middleware) => {
          return function (action, payload) {
            return middleware(store)(next)(action, payload);
          };
        }, (action, payload) => {
          return reducers.reduce((state, reducer) => {
            const reducerResult = reducer(state, action, payload);
            // support lazy dispatching inside reducer
            if (typeof reducerResult === 'function') {
              reducerResult((...args) => pendingDispatchings.push(args));
              return state;
            }
            return reducerResult;
          }, currentState);
        })(action, actionResult);

        if (currentState !== prevState) {
          updateLinkedProps();
          recompute();
          notify();
        }

        if (pendingDispatchings.length) {
          for (let [action, payload] of pendingDispatchings) {
            dispatch(action, payload);
          }
        }
      }
    }

    function getStore() {
      return store;
    }

    function subscribe(subscriber) {
      if (!subscriber.id) {
        subscriber.id = subscriptionUniqueId++;
      }
      subscriptions.push(subscriber);

      return function () {
        subscriber.unsubscribed = true;
      };
    }

    function notify(notifiedSubscriptions = {}) {
      const unsubscribedIndexes = [];
      for (let i = 0; i < subscriptions.length; i++) {
        const subscription = subscriptions[i];
        // do nothing if subscription is unsubscribed
        if (subscription.unsubscribed) {
          unsubscribedIndexes.push(i);
        } else if (subscription.id in notifiedSubscriptions) {
          // do nothing if subscription is already notified
        } else {
          // mark subscription is notified
          notifiedSubscriptions[subscription.id] = true;
          subscription(currentState);
        }
      }

      // remove unsubscribed subscriptions
      while (unsubscribedIndexes.length) {
        subscriptions.splice(unsubscribedIndexes.pop(), 1);
      }
    }

    const updateProps = () => {
      if (updatingProps) return;

      updatingProps = true;
      try {
        const prevState = currentState;
        for (let linkedProp of linkedProps) {
          const [destProp, store, sourceProp] = linkedProp;
          const nextValue = !sourceProp ? store.getState() : store.getState()[sourceProp];

          if (currentState[destProp] !== nextValue) {
            if (currentState === prevState) {
              currentState = _extends({}, currentState);
            }

            currentState[destProp] = nextValue;
          }
        }

        if (currentState !== prevState) {
          recompute();
          notify();
        }
      } finally {
        updatingProps = false;
      }
    };

    function update(describers) {
      const describingContext = {
        objectType: StoreType,
        getStore,
        addReducer,
        addStore,
        addMiddleware,
        addProperty
      };

      describers.forEach(describer => describer(describingContext));

      const debouncedUpdateProps = debounce(0, updateProps);

      if (linkedProps.length) {
        if (currentState === null || currentState === undefined) {
          currentState = {};
        }

        linkedProps.forEach(linkedProp => {
          if (linkedProp.subscribed) return;
          linkedProp.subscribed = true;
          linkedProp[1].subscribe(debouncedUpdateProps);
        });

        updateProps();
      }

      if (computedProps.length) {
        recompute();
      }
    }

    update(describers);

    return store = _extends({}, initMethods, {
      getState,
      subscribe,
      dispatch,
      [unsafeUpdate]: update,
      [unsafeSetState]: setState
    });
  };
}

/**
 * add reducer to store
 */
export function withReducer(...reducers) {
  return function ({ addReducer }) {
    reducers.forEach(addReducer);
  };
}

/**
 * add middleware to store
 */
export function withMiddleware(...middlewares) {
  return function ({ addMiddleware }) {
    middlewares.forEach(addMiddleware);
  };
}

/**
 * create a component/hoc
 */
export function component(defaultComponent) {
  return function (describers) {
    const hoc = function (component) {
      const propertyDescriptors = [];
      const stores = [];
      const observables = [];
      const hocs = [];
      const describingContext = {
        objectType: ComponentType,
        component,
        addStore,
        addProperty,
        addHoc,
        addObservable
      };
      describers.forEach(describer => describer(describingContext));

      function addStore(store) {
        stores.push(store);
      }

      function addObservable(observable) {
        observables.push(observable);
      }

      function addHoc(hoc) {
        hocs.push(hoc);
      }

      function addProperty(name, descriptor, map = defaultPropMapper, options, order = 0) {
        if (typeof map === 'string') {
          const propName = map;
          map = x => x[propName];
        }

        propertyDescriptors.push([name, descriptor, map, options, order]);
        // re-sort descriptors
        propertyDescriptors.sort((a, b) => a[4] - b[4]);
      }

      function mapProps(component, ownedProps) {
        const mappedProps = {};
        const descriptionContext = {
          component,
          ownedProps,
          mappedProps,
          // detech prop changed
          propsChanged: component.prevProps && component.prevProps !== component.props
        };

        component.prevProps = component.props;

        for (let [propName, propertyDescritor, map] of propertyDescriptors) {
          const rawPropValue = propertyDescritor(descriptionContext, propName, map);
          if (rawPropValue === ignore) continue;
          let propValue = map !== false ? map.apply(null, rawPropValue.concat([descriptionContext])) : rawPropValue;

          if (typeof propValue === 'function' && !propValue[isDispatcher]) {
            propValue = propValue(descriptionContext);
          }

          if (propName === '*') {
            Object.assign(mappedProps, propValue);
          } else {
            mappedProps[propName] = propValue;
          }
        }

        return mappedProps;
      }

      return hocs.reduce((component, hoc) => hoc(component), class ComponentWrapper extends React.Component {
        constructor(props) {
          super(props);
          // perform first mapping
          // collect all dependency stores if any
          this.mappedProps = mapProps(this, props);

          const unsubscribes = [];

          const handleChange = () => this.setState(dummyState);

          unsubscribes.push(...stores.map(store => store.subscribe(handleChange)));

          unsubscribes.push(...observables.map(observable => observable.subscribe(value => {
            observable.__lastValue = value;
            handleChange();
          })));

          this.unsubscribe = () => unsubscribes.forEach(unsubscribe => {
            if (unsubscribe && typeof unsubscribe.unsubscribe === 'function') {
              unsubscribe.unsubscribe();
            } else if (typeof unsubscribe === 'function') {
              unsubscribe();
            }
          });
        }

        shouldComponentUpdate(nextProps) {
          const nextMappedProps = mapProps(this, nextProps);
          if (shallowEqual(nextMappedProps, this.mappedProps, true)) return false;
          this.mappedProps = nextMappedProps;
          return true;
        }

        componentWillUnmount() {
          this.unsubscribe();
        }

        render() {
          return React.createElement(component, this.mappedProps);
        }
      });
    };

    if (defaultComponent) {
      return hoc(defaultComponent);
    }
    return hoc;
  };
}

/**
 * describe prop for component
 */
export function withProp(name, evaluatorFactory, map, options) {
  return function (describingContext) {
    const { addProperty } = describingContext;
    const evaluator = evaluatorFactory(describingContext);

    addProperty(name, function (descriptionContext) {
      return evaluator(descriptionContext);
    }, map, options);
  };
}

/**
 * get value from component state
 */
export function fromState(...props) {
  return function ({ objectType }) {
    if (objectType !== ComponentType) {
      throw new Error('fromState can be used with component()');
    }
    return function (descriptionContext) {
      const state = descriptionContext.component.state || {};
      return props.map(prop => state[prop]);
    };
  };
}

// get value from store
export function fromStore(...stores) {
  return function ({ addStore }) {
    stores.forEach(store => addStore(store));

    return function () {
      return stores.map(store => store.getState());
    };
  };
}

export function fromValue(factory) {
  return function () {
    return function (descriptionContext) {
      return [factory(descriptionContext)];
    };
  };
}

export function fromObservable(...observables) {
  return function ({ addObservable }) {
    observables.forEach(observable => addObservable(observable));
    return function () {
      return observables.map(observable => observable.__lastValue);
    };
  };
}

export function fromPromise(factory, { defaultValue, shouldUpdate = noop } = {}) {
  const loadingPayload = [defaultValue, 'loading'];
  return function ({ objectType }) {
    if (objectType !== ComponentType) {
      throw new Error('fromState can be used with component()');
    }
    return function (descriptionContext, propName) {
      const { component } = descriptionContext;
      const promisePropName = `__${propName}Promise`;

      if (component[promisePropName]) {
        if (shouldUpdate(descriptionContext, component[promisePropName])) {} else {
          return component[promisePropName].__payload;
        }
      }

      const promise = factory(descriptionContext);

      if (!promise) {
        return [defaultValue, ''];
      }

      promise.__payload = loadingPayload;

      component[promisePropName] = promise;

      promise.then(
      // handle success
      result => {
        if (component[promisePropName] === promise) {
          component[promisePropName].__payload = [result, 'success'];
          // reload
          component.setState(dummyState);
        }
      },
      // handle failure
      error => {
        if (component[promisePropName] === promise) {
          component[promisePropName].__payload = [defaultValue, 'failure', error];
          // reload
          component.setState(dummyState);
        }
      });

      return promise.__payload;
    };
  };
}

/**
 * get value from props
 */
export function fromProp(...propNames) {
  return function () {
    return function ({ ownedProps }) {
      return propNames.map(propName => ownedProps[propName]);
    };
  };
}

function createPayloadFactory() {
  return undefined;
}

/**
 * add wired action to component props
 */
export function withAction(name, store, ...args) {
  return function (describingContext) {
    const { objectType, addProperty } = describingContext;
    if (objectType === StoreType) {
      return addProperty(name, Object.assign(store, { [isAction]: true }), false);
    } else {
      // is component type
      let getStore;
      // withAction('name', store.action, payloadFactory)
      if (typeof store === 'function') {
        const action = store;
        if (action[StoreType]) {
          args.unshift(action);
          getStore = action[StoreType];
        } else {
          action[isDispatcher] = true;
          addProperty(name, function (descriptionContext) {
            return action;
          }, false);
          return;
        }
      } else {
        getStore = () => {
          return store;
        };
        // withAction('name', store, action, payloadFactory)
      }
      return addAction(describingContext, name, getStore, ...args);
    }
  };
}

function addAction(describingContext, name, getStore, action, payloadFactory = defaultPayloadFactory) {
  const { addProperty } = describingContext;

  if (typeof payloadFactory === 'string') {
    const ownedPropName = payloadFactory;
    payloadFactory = () => ({ ownedProps }) => ownedProps[ownedPropName];
  } else if (typeof payloadFactory !== 'function') {
    payloadFactory = createPayloadFactory(payloadFactory, describingContext);
  }

  addProperty(name, function (descriptionContext) {
    return Object.assign(function () {
      let payload = payloadFactory.apply(null, arguments);

      if (typeof payload === 'function') {
        payload = payload(descriptionContext, action);
      }

      // support redux action
      if (!action) {
        return getStore().dispatch(payload);
      }
      return getStore().dispatch(action, payload);
    }, {
      [isDispatcher]: true
    });
  }, false);
}

export function withHoc(...hocs) {
  return function ({ addHoc }) {
    hocs.forEach(addHoc);
  };
}

export function shallowEqual(value1, value2, ignoreFuncs) {
  if (value1 === value2) return true;
  // compare date
  if (value1 instanceof Date && value2 instanceof Date) {
    return value1.getTime() === value2.getTime();
  }
  if (value1 && value2) {
    if (Array.isArray(value1)) {
      const length = value1.length;
      if (length !== value2.length) return false;
      for (let i = 0; i < length; i++) {
        const value1Prop = value1[i];
        const value2Prop = value2[i];
        if (ignoreFuncs && typeof value1Prop === 'function' && typeof value2Prop === 'function') continue;
        if (value1Prop !== value2Prop) return false;
      }
      return true;
    }
    const value1Keys = Object.keys(value1);
    if (value1Keys.length !== Object.keys(value2).length) return false;
    for (let key of value1Keys) {
      const value1Prop = value1[key];
      const value2Prop = value2[key];
      if (ignoreFuncs && typeof value1Prop === 'function' && typeof value2Prop === 'function') continue;
      if (value1Prop !== value2Prop) return false;
    }
    return true;
  }
  return false;
}

export function debounce(interval, callback) {
  let timer;

  return function () {
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(() => callback.apply(null, args), interval);
  };
}

export function selector(...funcs) {
  const lastFunc = funcs.pop();
  let lastArgs, lastResult;
  const wrapper = function (...args) {
    if (shallowEqual(lastArgs, args)) {
      return lastResult;
    }
    lastArgs = args;
    return lastResult = lastFunc.apply(null, args);
  };

  if (!funcs.length) {
    return wrapper;
  }

  const argSelectors = funcs.map(x => selector(x));
  return function (...args) {
    const mappedArgs = argSelectors.map(x => x.apply(null, args));
    return wrapper.apply(null, mappedArgs);
  };
}
//# sourceMappingURL=index.js.map
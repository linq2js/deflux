import React from 'react';

const defaultPropMapper = x => x;
const defaultPayloadFactory = (context, firstArg) => firstArg;
const dummyState = {};
const unsafeSetState = Symbol('SetState');
const unsafeUpdate = Symbol('Update');
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
  return function(describers) {
    const reducers = [];
    const subscriptions = [];
    const computedProps = [];
    const linkedProps = [];
    const middlewares = [];
    const stores = [];
    const describingContext = {
      addReducer,
      addStore,
      addMiddleware,
      addProperty
    };
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
            currentState = {
              ...currentState
            };
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
            const prevValue =
              sourceProp === '*'
                ? store.getState()
                : store.getState()[sourceProp];
            // update source store
            if (nextValue !== prevValue) {
              if (sourceProp === '*') {
                store[unsafeSetState](nextValue);
              } else {
                store[unsafeSetState]({
                  ...store.getState(),
                  [sourceProp]: nextValue
                });
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

    function addProperty(name, descriptor, map = name, options) {
      if (typeof map === 'string') {
        // create linked prop
        if (!stores.length) {
          throw new Error('At least store required to create linked prop');
        } else if (stores.length > 1) {
          throw new Error('Linked prop requires only a store');
        }
        linkedProps.push([name, stores[0], map, options]);
        stores.length = 0;
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
        currentState = middlewares.reduce(
          (next, middleware) => {
            return function(action, payload) {
              return middleware(store)(next)(action, payload);
            };
          },
          (action, payload) => {
            return reducers.reduce((state, reducer) => {
              const reducerResult = reducer(state, action, payload);
              // support lazy dispatching inside reducer
              if (typeof reducerResult === 'function') {
                reducerResult((...args) => pendingDispatchings.push(args));
                return state;
              }
              return reducerResult;
            }, currentState);
          }
        )(action, actionResult);

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

    function subscribe(subscriber) {
      if (!subscriber.id) {
        subscriber.id = subscriptionUniqueId++;
      }
      subscriptions.push(subscriber);

      return function() {
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
          const nextValue =
            sourceProp === '*'
              ? store.getState()
              : store.getState()[sourceProp];

          if (currentState[destProp] !== nextValue) {
            if (currentState === prevState) {
              currentState = {
                ...currentState
              };
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

    return (store = {
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
  return function({ addReducer }) {
    reducers.forEach(addReducer);
  };
}

/**
 * add middleware to store
 */
export function withMiddleware(...middlewares) {
  return function({ addMiddleware }) {
    middlewares.forEach(addMiddleware);
  };
}

/**
 * create a component/hoc
 */
export function component(defaultComponent) {
  return function(describers) {
    const hoc = function(component) {
      const propertyDescriptors = [];
      const stores = [];
      const hocs = [];
      const describingContext = {
        component,
        addStore,
        addProperty,
        addHoc
      };
      describers.forEach(describer => describer(describingContext));

      function addStore(store) {
        stores.push(store);
      }

      function addHoc(hoc) {
        hocs.push(hoc);
      }

      function addProperty(
        name,
        descriptor,
        map = defaultPropMapper,
        options,
        order = 0
      ) {
        if (typeof map === 'string') {
          const propName = map;
          map = x => x[propName];
        }

        propertyDescriptors.push([name, descriptor, map, options, order]);
        // re-sort descriptors
        propertyDescriptors.sort((a, b) => a[4] - b[4]);
      }

      function mapProps(ownedProps) {
        const mappedProps = {};
        const descriptionContext = {
          ownedProps,
          mappedProps
        };

        for (let [propName, propertyDescritor, map] of propertyDescriptors) {
          const rawPropValue = propertyDescritor(descriptionContext);
          const propValue =
            map !== false ? map.apply(null, rawPropValue) : rawPropValue;

          if (propName === '*') {
            Object.assign(mappedProps, propValue);
          } else {
            mappedProps[propName] = propValue;
          }
        }

        return mappedProps;
      }

      return hocs.reduce(
        (component, hoc) => hoc(component),
        class ComponentWrapper extends React.Component {
          constructor(props) {
            super(props);
            // perform first mapping
            // collect all dependency stores if any
            this.mappedProps = mapProps(props);

            const handleChange = () => this.setState(dummyState);

            stores.forEach(store => store.subscribe(handleChange));
          }

          shouldComponentUpdate(nextProps) {
            const nextMappedProps = mapProps(nextProps);
            if (shallowEqual(nextMappedProps, this.mappedProps, true))
              return false;
            this.mappedProps = nextMappedProps;
            return true;
          }

          render() {
            return React.createElement(component, this.mappedProps);
          }
        }
      );
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
  return function({ addProperty, addStore }) {
    const evaluator = evaluatorFactory({ addStore });

    addProperty(
      name,
      function(descriptionContext) {
        return evaluator(descriptionContext);
      },
      map,
      options
    );
  };
}

// get value from store
export function fromStore(...stores) {
  return function({ addStore }) {
    stores.forEach(store => addStore(store));

    return function() {
      return stores.map(store => store.getState());
    };
  };
}

/**
 * get value from props
 */
export function fromProp(...propNames) {
  return function() {
    return function({ ownedProps }) {
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
export function withAction(
  name,
  store,
  action,
  payloadFactory = defaultPayloadFactory
) {
  return function(describingContext) {
    const { addProperty } = describingContext;
    if (typeof payloadFactory !== 'function') {
      payloadFactory = createPayloadFactory(payloadFactory, describingContext);
    }

    addProperty(
      name,
      function(descriptionContext) {
        return function(...inputArgs) {
          let payload = payloadFactory(describingContext, ...inputArgs);

          return store.dispatch(action, payload);
        };
      },
      false
    );
  };
}

export function withHoc(...hocs) {
  return function({ addHoc }) {
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
        if (
          ignoreFuncs &&
          typeof value1Prop === 'function' &&
          typeof value2Prop === 'function'
        )
          continue;
        if (value1Prop !== value2Prop) return false;
      }
      return true;
    }
    const value1Keys = Object.keys(value1);
    if (value1Keys.length !== Object.keys(value2).length) return false;
    for (let key of value1Keys) {
      const value1Prop = value1[key];
      const value2Prop = value2[key];
      if (
        ignoreFuncs &&
        typeof value1Prop === 'function' &&
        typeof value2Prop === 'function'
      )
        continue;
      if (value1Prop !== value2Prop) return false;
    }
    return true;
  }
  return false;
}

export function debounce(interval, callback) {
  let timer;

  return function() {
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(() => callback.apply(null, args), interval);
  };
}

export function selector(...funcs) {
  const lastFunc = funcs.pop();
  let lastArgs, lastResult;
  const wrapper = function(...args) {
    if (shallowEqual(lastArgs, args)) {
      return lastResult;
    }
    lastArgs = args;
    return (lastResult = lastFunc.apply(null, args));
  };

  if (!funcs.length) {
    return wrapper;
  }

  const argSelectors = funcs.map(x => selector(x));
  return function(...args) {
    const mappedArgs = argSelectors.map(x => x.apply(null, args));
    return wrapper.apply(null, mappedArgs);
  };
}

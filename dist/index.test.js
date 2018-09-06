var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { mount, configure } from 'enzyme';
import { create, update, store, component, withProp, withMiddleware, withReducer, fromProp, fromStore } from './index';

configure({
  adapter: new Adapter()
});

describe('store', () => {
  test('store: initialState', () => {
    const testStore = create(store({ counter: 1 }));
    expect(testStore.getState()).toEqual({ counter: 1 });
  });

  test('store: computed prop', () => {
    const testStore = create(store({ counter: 1 }), withProp('doubleCounter', fromProp('counter'), x => x * 2));
    expect(testStore.getState()).toEqual({ counter: 1, doubleCounter: 2 });
  });

  test('store: linked prop', () => {
    const rootStore = create(store({ value: 1 }));
    const testStore = create(store({}), withProp('counter', fromStore(rootStore), 'value'));
    expect(testStore.getState()).toEqual({ counter: 1 });
  });

  test('store: update linked prop', done => {
    const rootStore = create(store({ value: 1 }));
    const testStore = create(store({}), withProp('counter', fromStore(rootStore), 'value'));
    const updateCounter = () => state => ({ counter: 5 });

    // update child store will affect to parent store immediately
    testStore.dispatch(updateCounter);

    expect(testStore.getState()).toEqual({ counter: 5 });
    expect(rootStore.getState()).toEqual({ value: 5 });

    const updateValue = () => state => ({ value: 10 });

    rootStore.dispatch(updateValue);

    // update parent store will affect to child stores lazyly
    setTimeout(() => {
      expect(testStore.getState()).toEqual({ counter: 10 });
      expect(rootStore.getState()).toEqual({ value: 10 });

      done();
    }, 0);
  });

  test('store: update linked prop', () => {
    const rootStore = create(store({ value: 1 }));
    const testStore = create(store({}));
    expect(testStore.getState()).toEqual({ counter: undefined });
    update(testStore, withProp('counter', fromStore(rootStore), 'value'));
    expect(testStore.getState()).toEqual({ counter: 1 });
  });

  test('store: middleware should be called', () => {
    let middlewareCallTimes = 0;
    const updateAction = () => 100;
    const testStore = create(store({}), withMiddleware(store => next => (action, payload) => {
      expect(action).toBe(updateAction);
      expect(payload).toBe(100);
      middlewareCallTimes++;
      return next(action, payload);
    }), withMiddleware(store => next => (action, payload) => {
      expect(action).toBe(updateAction);
      expect(payload).toBe(100);
      middlewareCallTimes++;
    }));

    testStore.dispatch(updateAction);

    expect(middlewareCallTimes).toBe(2);
  });

  test('store: reducer should be called', () => {
    const increase = by => by;
    const decrease = by => by;
    let subscriptionCalls = 0;
    let unsubscribe;
    const testStore = create(store(0), withReducer((state, action, by = 1) => action === increase ? state + by : action === decrease ? state - by : state));
    unsubscribe = testStore.subscribe(nextState => {
      expect(nextState).toBe(10);
      subscriptionCalls++;
    });
    testStore.dispatch(increase, 10);
    unsubscribe();
    expect(testStore.getState()).toBe(10);

    unsubscribe = testStore.subscribe(nextState => {
      expect(nextState).toBe(6);
      subscriptionCalls++;
    });
    testStore.dispatch(decrease, 4);
    unsubscribe();
    expect(testStore.getState()).toBe(6);
    expect(subscriptionCalls).toBe(2);
  });

  test('store: withReducer(propName, reducer)', () => {
    const increase = by => by;
    const decrease = by => by;
    const reducer = (state, action, payload) => {
      if (action === increase) {
        return state + payload;
      }
      if (action === decrease) {
        return state - payload;
      }
      return state;
    };

    const testStore = create(store({
      counter1: 1,
      counter2: 2
    }), withReducer('counter1', reducer), withReducer('counter2', reducer));

    testStore.dispatch(increase, 2);
    expect(testStore.getState()).toEqual({
      counter1: 3,
      counter2: 4
    });
  });

  test("store: parent store's props should be updated once linked props updated", done => {
    const IdStore = create(store([]));
    const TextStore = create(store({}));
    const TodoStore = create(store(),
    // link ids to IdStore, it holds id list
    withProp('ids', fromStore(IdStore)),
    // link texts to TextStore, it holds text list
    withProp('texts', fromStore(TextStore)));
    const AddTodoAction = text => state => {
      const id = 1;
      return _extends({}, state, {
        // append id to id list
        ids: [...state.ids, id],
        // set new text to texts hash
        texts: _extends({}, state.texts, {
          [id]: text
        })
      });
    };
    TodoStore.dispatch(AddTodoAction, 'Test Todo');
    setTimeout(() => {
      expect(IdStore.getState()).toEqual([1]);
      done();
    }, 0);
  });
});

describe('component', () => {
  test('component: should return component if default component is specified', () => {
    const TestComponent = create(component(props => React.createElement(
      'div',
      null,
      props.text
    )), withProp('text', fromProp('text')));
    const renderResult = mount(React.createElement(TestComponent, { text: 'Hello World' }));
    expect(renderResult.html()).toBe('<div>Hello World</div>');
  });

  test('component: should return hoc if no default component is specified', () => {
    const HOC = create(component(), withProp('text', fromProp('text')));
    expect(typeof HOC).toBe('function');
    expect(typeof HOC()).toBe('function');
  });

  test('component: understand normal function as hoc', () => {
    let extension1Called = false;
    const render = props => 'test component';
    const withExtension1 = options => component => {
      expect(options).toBe(1);
      expect(typeof component).toBe('function');
      extension1Called = true;
      return component;
    };
    let extension2Called = false;
    const withExtension2 = options => component => {
      expect(options).toBe(2);
      expect(typeof component).toBe('function');
      extension2Called = true;
      return component;
    };
    const comp = create(component(render), withExtension1(1), withExtension2(2));

    expect(extension1Called).toBe(true);
    expect(extension2Called).toBe(true);
  });

  test('component: should retrieve prop value from store', () => {
    const testStore = create(store('Hello World'));
    const TestComponent = create(component(props => React.createElement(
      'div',
      null,
      props.text
    )), withProp('text', fromStore(testStore)));
    const renderResult = mount(React.createElement(TestComponent, null));
    expect(renderResult.html()).toBe('<div>Hello World</div>');
  });

  test('component: should re-render if store changed', () => {
    const testStore = create(store('Hello'));
    const changeText = () => state => 'World';
    const TestComponent = create(component(props => React.createElement(
      'div',
      null,
      props.text
    )), withProp('text', fromStore(testStore)));
    const instance = mount(React.createElement(TestComponent, null));

    expect(instance.html()).toBe('<div>Hello</div>');

    testStore.dispatch(changeText);
    expect(instance.html()).toBe('<div>World</div>');
  });
});
//# sourceMappingURL=index.test.js.map
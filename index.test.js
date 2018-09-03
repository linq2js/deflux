import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { mount, configure } from 'enzyme';
import {
  create,
  update,
  store,
  component,
  withProp,
  withMiddleware,
  withReducer,
  fromProp,
  fromStore
} from './index';

configure({
  adapter: new Adapter()
});

describe('store', () => {
  test('store: initialState', () => {
    const testStore = create(store({ counter: 1 }));
    expect(testStore.getState()).toEqual({ counter: 1 });
  });

  test('store: computed prop', () => {
    const testStore = create(
      store({ counter: 1 }),
      withProp('doubleCounter', fromProp('counter'), x => x * 2)
    );
    expect(testStore.getState()).toEqual({ counter: 1, doubleCounter: 2 });
  });

  test('store: linked prop', () => {
    const rootStore = create(store({ value: 1 }));
    const testStore = create(
      store({}),
      withProp('counter', fromStore(rootStore), 'value')
    );
    expect(testStore.getState()).toEqual({ counter: 1 });
  });

  test('store: update linked prop', done => {
    const rootStore = create(store({ value: 1 }));
    const testStore = create(
      store({}),
      withProp('counter', fromStore(rootStore), 'value')
    );
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
    const testStore = create(
      store({}),
      withMiddleware(store => next => (action, payload) => {
        expect(action).toBe(updateAction);
        expect(payload).toBe(100);
        middlewareCallTimes++;
        return next(action, payload);
      }),
      withMiddleware(store => next => (action, payload) => {
        expect(action).toBe(updateAction);
        expect(payload).toBe(100);
        middlewareCallTimes++;
      })
    );

    testStore.dispatch(updateAction);

    expect(middlewareCallTimes).toBe(2);
  });

  test('store: reducer should be called', () => {
    const increase = by => by;
    const decrease = by => by;
    let subscriptionCalls = 0;
    let unsubscribe;
    const testStore = create(
      store(0),
      withReducer(
        (state, action, by = 1) =>
          action === increase
            ? state + by
            : action === decrease
            ? state - by
            : state
      )
    );
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
});

describe('component', () => {
  test('component: should return component if default component is specified', () => {
    const TestComponent = create(
      component(props => <div>{props.text}</div>),
      withProp('text', fromProp('text'))
    );
    const renderResult = mount(<TestComponent text="Hello World" />);
    expect(renderResult.html()).toBe('<div>Hello World</div>');
  });

  test('component: should return hoc if no default component is specified', () => {
    const HOC = create(component(), withProp('text', fromProp('text')));
    expect(typeof HOC).toBe('function');
    expect(typeof HOC()).toBe('function');
  });

  test('component: should retrieve prop value from store', () => {
    const testStore = create(store('Hello World'));
    const TestComponent = create(
      component(props => <div>{props.text}</div>),
      withProp('text', fromStore(testStore))
    );
    const renderResult = mount(<TestComponent />);
    expect(renderResult.html()).toBe('<div>Hello World</div>');
  });

  test('component: should re-render if store changed', () => {
    const testStore = create(store('Hello'));
    const changeText = () => state => 'World';
    const TestComponent = create(
      component(props => <div>{props.text}</div>),
      withProp('text', fromStore(testStore))
    );
    const instance = mount(<TestComponent />);

    expect(instance.html()).toBe('<div>Hello</div>');

    testStore.dispatch(changeText);
    expect(instance.html()).toBe('<div>World</div>');
  });
});
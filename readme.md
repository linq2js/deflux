# deflux

A declarative FLUX architecture for React

## Features

1.  Flux architecture
1.  Support multiple stores
1.  Support declarative syntax
1.  Support pure function for action / render / component / reducer
1.  Support linked props
1.  Support computed props
1.  Update store props/reducers/middleware on demand

## Samples
https://codesandbox.io/s/j30rxwnww9

## References

### create(factory, ...describers)

Create an object which is built by factory method and describers

### update(target, ...describers)

### store(initialState)

Create store factory with initialState

### component(renderMethodOrComponentClass)

Create component factory. create() will return HOC instead Component if no renderMethodOrComponentClass specified

### Store: withProp(stateProp, fromStore(parentStore), parentProp)

Declare linked store prop which is linked to a specific prop of parent store.
Once parent store updated, all linked props of child stores will update as well
Remark: When You update linked props of child stores, parent store's props will update as well. This is 2 ways binding.
It is helpful to create an action can update multiple stores
For sample: Imaging you have 2 stores, one for todo ids, other for todo texts. You want to update both stores with an action

```jsx harmony
const IdStore = create(store([]));
const TextStore = create(store({}));
const TodoStore = create(
  store(),
  // link ids to IdStore, it holds id list
  withProp("ids", fromStore(IdStore), "*"),
  // link texts to TextStore, it holds text list
  withProp("texts", fromStore(TextStore), "*")
);
const AddTodoAction = text => state => {
  const id = new Date().getTime();
  return {
    ...state,
    // append id to id list
    ids: [...state.ids, id],
    // set new text to texts hash
    texts: {
      ...state.texts,
      [id]: text
    }
  };
};
TodoStore.dispatch(AddTodoAction, "Test Todo");
```

### Store: withProp(stateProp, fromProp(...propNames), computer)

Declare computed store prop which can be computed from one or many props.

```jsx harmony
create(
  store({ width: 5, height: 2 }),
  // compute area from with & height
  withProp(
    "area",
    fromProp("width", "height"),
    (width, height) => width * height
  )
);
```

### Store: withReducer(...reducers)

Declare reducer for the store. Reducer is function, it retrieves (state, action, payload) => newState.
Reducer will be called if there is any action creator called.
There are two kinds of action. One can modify state and other only create action payload only

```jsx harmony
const MyActionCreator = text => text;
// when an action returns a function, it will retrieve state as an argument and it becomes state modifier.
// No reducer can handle this action type
const MyStateModifierAction = text => state => ({ text });
const MyReducer = (state, action, payload) => {
  if (action === MyActionCreator) {
    // do something and return new state
    return { ...state, text: payload };
  }
  return state;
};
MyStore.dispatch(MyActionCreator, "Hello World");
```

### Store: withMiddleware(...middleware)

Declare middleware for the store. Middleware is a curry function, it retrieves store => next => (action, payload) => newState

### Component: withProp(name, propSource, map)

Declare component prop, there are two prop sources: fromStore and fromProp (owned props).
You can specific the prop retrieves value from one or more Stores

```jsx harmony
withProp(
  "name",
  fromStore(store1, store2, store3),
  // map all store states to prop value
  (store1State, store2State, store3State) => finalValue
);
```

You can specific the prop retrieves value from one or more owned props

```jsx harmony
withProp(
  "name",
  fromProp("prop1", "prop2", "prop3"),
  // map all owned prop value to new prop value
  (prop1Value, prop2Value, prop3Value) => finalValue
);
```

You also specific multiple props at once

```jsx harmony
withProp("*", fromStore(store), state => ({
  prop1: state.value1,
  prop2: state.value2
}));
```

### Component: withAction(name, store, action, payloadFactory)

Declare wired action as component prop

```jsx harmony
const MyStore = create(store({ name: "Peter" }));
const MyAction = () => state => {
  alert(state.name);
  // no change
  return state;
};
const Component = create(
  component(props => <div onClick={props.click} />),
  withAction("click", MyStore, MyAction)
);
```

You can pass payloadFactory to produce new payload from calling context and input args.
Calling context has some props: ownedProps (the original props retrieved from parent component),
mappedProps (the props that component will be used to render)
payloadFactory has prototype: (callingContext, arg1, arg2, ...) => payload
```jsx harmony
withAction(
  "propName",
  MyStore,
  MyAction,
  (callingContext, arg1, arg2, arg3) =>
    arg1 + arg3 + callingContext.ownedProps.name
);
```

# deflux

A declarative flux architecture for React

## Features
1. Flux architecture
1. Support multiple store
1. Support declarative syntax
1. Support pure function for action / render / component / reducer
1. Support linked props
1. Support computed props
1. Update store props/reducers/middleware on demand

## Samples

## References

### create(factory, ...describers)

### update(target, ...describers)

### store(initialState)

### component(renderOrClass)

### Store: withProp(stateProp, fromStore(parentStore), parentProp)

### Store: withProp(stateProp, fromProp(...propNames), computer)

### Store: withReducer(...reducers)

### Store: withMiddleware(...middleware)

### Component: withProp(name, fromStore(...stores), map)

### Component: withProp(name, fromProp(...props), map)

### Component: withAction(name, store, action, payloadFactory)
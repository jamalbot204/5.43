declare module 'mark.js/dist/mark.es6.js';

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
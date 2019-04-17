import { createBrowserHistory } from 'history';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
// import { Provider } from 'react-redux';
import { Router } from 'react-router';
import { App } from './app';
// import { configureStore } from './app/store';

// prepare store
// const history = createBrowserHistory();
// const store = configureStore();

ReactDOM.render(
    <Router history={createBrowserHistory()}>
      <App />
    </Router>,
  document.getElementById('root'),
);

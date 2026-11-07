import {createContext, useContext} from 'react';

// App owns the preference and persistence. Garden's portaled settings consume
// the same value; they never maintain a second theme preference.
export const UiThemeContext = createContext(null);
export const useUiTheme = () => useContext(UiThemeContext);

// Shell hooks shared by all views (configured once by app.js).
let impl = { setScreen() {}, navigate(h) { location.hash = h; }, refreshUnread() {} };
export function configureShell(fns) { impl = { ...impl, ...fns }; }
export const setScreen = (label, trace) => impl.setScreen(label, trace);
export const navigate = (hash) => impl.navigate(hash);
export const refreshUnread = () => impl.refreshUnread();

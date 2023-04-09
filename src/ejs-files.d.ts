declare module '*.ejs' {
  const fn: import('ejs').AsyncClientFunction;
  export default fn;
}

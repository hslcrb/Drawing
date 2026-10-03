/// <reference types="vite/client" />
declare module "*.wasm?url&inline" {
  const value: string;
  export default value;
}

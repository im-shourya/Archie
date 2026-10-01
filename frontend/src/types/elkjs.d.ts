// elkjs ships types for the API but not for the raw worker script or the .js entry paths.
declare module "elkjs/lib/elk-worker.min.js";
declare module "elkjs/lib/elk-api.js" {
  const ELK: unknown;
  export default ELK;
}

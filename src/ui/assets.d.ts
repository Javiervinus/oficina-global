// esbuild deja cada PNG y MP3 como data-URL (`loader: { ".png": "dataurl", ".mp3": "dataurl" }`).
declare module "*.png" {
  const url: string;
  export default url;
}
declare module "*.mp3" {
  const url: string;
  export default url;
}

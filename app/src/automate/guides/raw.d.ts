// The setup guides are bundled as text with Vite's ?raw (OUT-91).
declare module "*.md?raw" {
  const text: string;
  export default text;
}

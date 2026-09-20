declare module "libheif-js/wasm-bundle" {
  interface DecodedDisplay {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }

  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(target: DecodedDisplay, callback: (result: DecodedDisplay | null) => void): void;
  }

  class HeifDecoder {
    decode(data: Uint8Array): HeifImage[];
  }

  const libheif: {
    HeifDecoder: typeof HeifDecoder;
  };

  export default libheif;
}

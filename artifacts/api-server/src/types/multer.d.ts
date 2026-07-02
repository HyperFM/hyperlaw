// Type declarations for multer v2 (no @types/multer exists for v2)
declare module "multer" {
  import { RequestHandler, Request } from "express";

  interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
    destination?: string;
    filename?: string;
    path?: string;
  }

  interface StorageEngine {
    _handleFile(
      req: Request,
      file: MulterFile,
      callback: (error?: Error | null, info?: Partial<MulterFile>) => void,
    ): void;
    _removeFile(req: Request, file: MulterFile, callback: (error: Error) => void): void;
  }

  interface Options {
    storage?: StorageEngine;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
    fileFilter?: (
      req: Request,
      file: MulterFile,
      callback: (error: Error | null, acceptFile: boolean) => void,
    ) => void;
  }

  interface Multer {
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: ReadonlyArray<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
    any(): RequestHandler;
  }

  function multer(options?: Options): Multer;
  namespace multer {
    function memoryStorage(): StorageEngine;
    function diskStorage(options: {
      destination?:
        | string
        | ((
            req: Request,
            file: MulterFile,
            callback: (error: Error | null, destination: string) => void,
          ) => void);
      filename?: (
        req: Request,
        file: MulterFile,
        callback: (error: Error | null, filename: string) => void,
      ) => void;
    }): StorageEngine;
  }

  export = multer;
}

// Augment Express.Request with multer file fields
declare global {
  namespace Express {
    interface Request {
      file?: import("multer").MulterFile;
      files?:
        | import("multer").MulterFile[]
        | { [fieldname: string]: import("multer").MulterFile[] };
    }
  }
}

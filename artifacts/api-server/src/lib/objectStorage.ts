import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { File, Storage } from '@google-cloud/storage';
import { Client } from '@replit/object-storage';

import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from './objectAcl';

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';

export const objectStorageClient = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: 'external_account',
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: 'json',
        subject_token_field_name: 'access_token',
      },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});
const appStorageClient = new Client();

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const paths = Array.from(
      new Set(
        pathsStr
          .split(',')
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          'tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths).',
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || '';
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          'tool and set PRIVATE_OBJECT_DIR env var.',
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(
    file: File,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === 'public';

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      'Content-Type':
        (metadata.contentType as string) || 'application/octet-stream',
      'Cache-Control': `${isPublic ? 'public' : 'private'}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers['Content-Length'] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split('/');
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join('/');
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith('/')) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  private getPrivateObjectName(objectPath: string): string {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }
    const entityId = objectPath.slice('/objects/'.length);
    if (!entityId) {
      throw new ObjectNotFoundError();
    }
    const privateObjectDir = this.getPrivateObjectDir();
    return parseObjectPath(`${privateObjectDir}/${entityId}`).objectName;
  }

  async downloadObjectEntityBuffer(objectPath: string): Promise<Buffer> {
    const objectName = this.getPrivateObjectName(objectPath);
    const result = await appStorageClient.downloadAsBytes(objectName);
    if (!result.ok) {
      if (result.error.statusCode === 404) {
        throw new ObjectNotFoundError();
      }
      throw new Error(result.error.message);
    }
    return Buffer.from(result.value[0]);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith('https://storage.googleapis.com/')) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith('/')) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith('/')) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  /**
   * List objects inside a public sub-folder (e.g. "photos" or "templates").
   * Returns metadata for each file found.
   */
  async listPublicObjects(folder: string): Promise<Array<{
    name: string;
    objectPath: string;
    size: number;
    updatedAt: string;
  }>> {
    const paths = this.getPublicObjectSearchPaths();
    const firstPath = paths[0];
    const fullPrefix = `${firstPath}/${folder}/`;
    const { objectName: prefix } = parseObjectPath(fullPrefix);
    const result = await appStorageClient.list({ prefix });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return result.value
      .filter((file) => file.name !== prefix && !file.name.endsWith('/'))
      .map((file) => {
        const filename = file.name.slice(prefix.length);
        return {
          name: filename,
          objectPath: `/public-objects/${folder}/${filename}`,
          size: 0,
          updatedAt: '',
        };
      });
  }

  /**
   * Upload a file into a public App Storage folder using the official SDK.
   */
  async uploadPublicObjectBuffer(
    folder: string,
    filename: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const paths = this.getPublicObjectSearchPaths();
    const fullPath = `${paths[0]}/${folder}/${filename}`;
    const { objectName } = parseObjectPath(fullPath);
    const result = await appStorageClient.uploadFromBytes(objectName, buffer);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    // Keep the existing GCS file metadata useful to callers that stream
    // through the low-level client. The SDK remains the source of truth for
    // the object write itself.
    try {
      const { bucketName } = parseObjectPath(fullPath);
      await objectStorageClient.bucket(bucketName).file(objectName).setMetadata({ contentType });
    } catch {
      // Content type is a serving hint; the upload itself already succeeded.
    }

    return `/public-objects/${folder}/${filename}`;
  }

  /**
   * Download a public object file given its sub-path (e.g. "photos/foo.jpg").
   */
  async getPublicObjectFile(subPath: string): Promise<File> {
    const paths = this.getPublicObjectSearchPaths();
    for (const searchPath of paths) {
      const fullPath = `${searchPath}/${subPath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    throw new ObjectNotFoundError();
  }

  async downloadPublicObjectBuffer(subPath: string): Promise<Buffer> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${subPath}`;
      const { objectName } = parseObjectPath(fullPath);
      const result = await appStorageClient.downloadAsBytes(objectName);
      if (result.ok) {
        return Buffer.from(result.value[0]);
      }
      if (result.error.statusCode !== 404) {
        throw new Error(result.error.message);
      }
    }
    throw new ObjectNotFoundError();
  }

  /**
   * Upload a buffer directly to private object storage.
   * Returns the objectPath (e.g. /objects/uploads/<uuid>) for later retrieval.
   */
  async uploadObjectEntityBuffer(
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { objectName } = parseObjectPath(fullPath);
    const result = await appStorageClient.uploadFromBytes(objectName, buffer);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return `/objects/uploads/${objectId}`;
  }

  /**
   * Delete an object from private storage by objectPath.
   * Silently ignores if the object does not exist.
   */
  async deleteObjectEntity(objectPath: string): Promise<void> {
    try {
      const objectName = this.getPrivateObjectName(objectPath);
      await appStorageClient.delete(objectName, { ignoreNotFound: true });
    } catch {
      // ignore missing objects
    }
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  const pathParts = path.split('/');
  if (pathParts.length < 3) {
    throw new Error('Invalid path: must contain at least a bucket name');
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  return {
    bucketName,
    objectName,
  };
}

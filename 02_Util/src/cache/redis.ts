/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright (c) 2023 S44, LLC
 */

import { ICache } from "@citrineos/base";
import { ClassConstructor, plainToInstance } from "class-transformer";
import { default as deasyncPromise } from "deasync-promise";
import { RedisClientOptions, RedisClientType, RedisFunctions, RedisModules, RedisScripts, createClient } from "redis";

/**
 * Implementation of cache interface with redis storage
 */
export class RedisCache implements ICache {
  private _client: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

  constructor(clientOptions?: RedisClientOptions) {
    this._client = clientOptions ? createClient(clientOptions) : createClient();
    this._client.on('connect', () => console.log('Redis client connected'));
    this._client.on('ready', () => console.log('Redis client ready to use'));
    this._client.on('error', (err) => console.error('Redis error', err));
    this._client.on('end', () => console.log('Redis client disconnected'));
    this._client.connect();
  }

  exists(key: string, namespace?: string): Promise<boolean> {
    namespace = namespace || "default";
    key = `${namespace}:${key}`;
    return this._client.exists(key).then((result) => result === 1);
  }

  remove(key: string, namespace?: string | undefined): Promise<boolean> {
    namespace = namespace || "default";
    key = `${namespace}:${key}`;
    return this._client.del(key).then((result) => result === 1);
  }

  onChange<T>(key: string, waitSeconds: number, namespace?: string | undefined, classConstructor?: (() => ClassConstructor<T>) | undefined): Promise<T | null> {
    namespace = namespace || "default";
    key = `${namespace}:${key}`;

    return new Promise((resolve) => {
      // Create a Redis subscriber to listen for operations affecting the key
      const subscriber = createClient();
      // Channel: Key-space, message: the name of the event, which is the command executed on the key
      subscriber.subscribe(`__keyspace@0__:${key}`, (channel, message) => {
        switch (message) {
          case "set":
            resolve(this.get(key, namespace, classConstructor));
            subscriber.quit();
            break;
          case "del":
          case "expire":
            resolve(null);
            subscriber.quit();
            break;
          default:
            // Do nothing
            break;
        }
      });
      setTimeout(() => {
        resolve(this.get(key, namespace, classConstructor));
        subscriber.quit();
      }, waitSeconds * 1000);
    });
  }

  get<T>(key: string, namespace?: string, classConstructor?: () => ClassConstructor<T>): Promise<T | null> {
    namespace = namespace || "default";
    key = `${namespace}:${key}`;
    return this._client.get(key).then((result) => {
      if (result) {
        if (classConstructor) {
          return plainToInstance(classConstructor(), JSON.parse(result));
        }
        return result as T;
      }
      return null;
    });
  }

  getSync<T>(key: string, namespace?: string, classConstructor?: () => ClassConstructor<T>): T | null {
    namespace = namespace || "default";
    key = `${namespace}:${key}`;
    return deasyncPromise(this._client.get(key).then((result) => {
      if (result) {
        if (classConstructor) {
          return plainToInstance(classConstructor(), JSON.parse(result));
        }
        return result as T;
      }
      return null;
    }));
  }

  set(key: string, value: string, namespace?: string, expireSeconds?: number): Promise<boolean> {
    namespace = namespace || "default";
    key = `${namespace}:${key}`;
    return this._client.set(key, value, { EX: expireSeconds }).then((result) => {
      if (result) {
        return result === "OK";
      }
      return false;
    });
  }

  setIfNotExist(key: string, value: string, namespace?: string, expireSeconds?: number): Promise<boolean> {
    namespace = namespace || "default";
    key = `${namespace}:${key}`;
    return this._client.set(key, value, { EX: expireSeconds, NX: true }).then((result) => {
      if (result) {
        return result === "OK";
      }
      return false;
    });
  }

  setSync(key: string, value: string, namespace?: string, expireSeconds?: number): boolean {
    namespace = namespace || "default";
    key = `${namespace}:${key}`;
    return deasyncPromise(this._client.set(key, value, { EX: expireSeconds }).then((result) => {
      if (result) {
        return result === "OK";
      }
      return false;
    }));
  }
}
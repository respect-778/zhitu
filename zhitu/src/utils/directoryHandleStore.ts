export interface PersonalDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
}

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open('knowvia-personal-storage', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('directories')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
async function access<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('directories', mode)
    const request = operation(tx.objectStore('directories'))
    tx.oncomplete = () => { const value = request.result; db.close(); resolve(value as T) }
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || request.error) }
    // 请求成功并不表示事务已经提交，目录绑定要等待 oncomplete。
  })
}
export const directoryHandleStore = {
  get: (uid: string) => access<PersonalDirectoryHandle | undefined>('readonly', store => store.get(uid)),
  put: (uid: string, handle: PersonalDirectoryHandle) => access<void>('readwrite', store => store.put(handle, uid)),
  remove: (uid: string) => access<void>('readwrite', store => store.delete(uid)),
}

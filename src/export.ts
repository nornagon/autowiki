import * as b64 from 'base64-arraybuffer';

type Base64String = string
type ExportFormatV0 = {
  _autowiki: { version: 1 },
  wiki: Record<string, string[]>,
  blobs: Record<string, {data: Base64String, type: string}>
}
type ExportFormatV1 = {
  _autowiki: { version: 2 }
  wiki: Record<string, {blocks: Array<{text: string}>}>
  blobs: Record<string, {data: Base64String, type: string}>
}
const IMPORT_TRANSFORMERS = [
  (x: any): ExportFormatV0 => x,
  /*
  (x: ExportFormatV0): ExportFormatV1 => ({
    _autowiki: { ...x._autowiki, version: 2 },
    //wiki: Object.fromEntries(Object.entries(x.wiki).map(([k, v]) => [k, {blocks: [{text: v}]}])),
    blobs: x.blobs
  }),
  */
] as const

type GetLength<original extends Readonly<any[]>> = original extends { length: infer L } ? L : never
type Prev<T extends number> = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62][T];
type GetLast<original extends Readonly<any[]>> = original[Prev<GetLength<original>>]

type AssertEquals<A, B> = A extends B ? B extends A ? true : never : never;
type LatestExportFormat = ReturnType<GetLast<typeof IMPORT_TRANSFORMERS>>
type LatestExportVersion = LatestExportFormat["_autowiki"]["version"]
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const staticAssert_lastVersionNumberEqualsLengthOfVersionTransformerArray: AssertEquals<LatestExportVersion, GetLength<typeof IMPORT_TRANSFORMERS>> = true

// TODO: would be awesome if typescript could fill in the value here, as it's singly-occupied. https://www.npmjs.com/package/ts-reflection maybe?
export const EXPORT_VERSION: LatestExportVersion = 1

/*
export const serialize = (doc: Y.Doc): LatestExportFormat => {
  return {
    _autowiki: { version: EXPORT_VERSION },
    wiki: doc.getMap('wiki').toJSON(),
    blobs: Object.fromEntries([
      ...Object.entries(doc.getMap('blobs').toJSON())
    ].map(([k, v]: [string, any]) => [k, {...v, data: b64.encode(v.data)}])),
  }
}
*/

  /*
export const deserialize = (doc: Y.Doc, data: any) => {
  const transformers = IMPORT_TRANSFORMERS.slice(data._autowiki.version)
  const transformedData: LatestExportFormat = transformers.reduce((data, transformer) => transformer(data), data)

  doc.transact(() => {
    const wiki: Y.Map<Y.Array<Y.Text>> = doc.getMap('wiki')
    for (const [page, data] of Object.entries(transformedData.wiki)) {
      const existingPage = wiki.get(page)
      if (existingPage?.length === data.length && existingPage?.toArray().every((x, i) => x.toString() === data[i]))
        continue
      const arr = new Y.Array<Y.Text>()
      arr.push(data.map(str => new Y.Text(str)))
      wiki.set(page, arr)
    }
    type BlobData = {data: Uint8Array, type: string}
    const blobs: Y.Map<BlobData> = doc.getMap('blobs')
    for (const [hash, blob] of Object.entries<any>(data.blobs)) {
      if (blobs.has(hash))
        continue
      blobs.set(hash, {
        ...blob,
        data: new Uint8Array(b64.decode(blob.data))
      })
    }
  })
}
*/

export const exportFormatError = (json: any): string | undefined => {
  if (!json._autowiki) {
    return "That doesn't look like a valid Autowiki export."
  }
  if (json._autowiki.version > EXPORT_VERSION) {
    return "That file is too new for this version of Autowiki :("
  }
}

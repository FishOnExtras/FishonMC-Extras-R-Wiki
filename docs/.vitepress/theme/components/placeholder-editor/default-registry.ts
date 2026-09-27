import { fromSchema } from './lang'
import { data } from './registry.data'

export const defaultRegistry = fromSchema(data.schema)
export const schemaVersion: string = data.display

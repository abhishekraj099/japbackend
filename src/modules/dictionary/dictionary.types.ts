export interface DictionaryResult {
  id: string;
  word: string;
  reading: string | null;
  meanings: string[];
  jlptLevel: string | null;
  partOfSpeech: string | null;
  frequency: number | null;
}

/**
 * Normalized shape any data source (JMdict, custom CSV, etc.) must produce
 * before it can be imported. Keeps the importer decoupled from the source format.
 */
export interface NormalizedEntry {
  word: string;
  reading?: string;
  meanings: string[];
  jlptLevel?: string;
  partOfSpeech?: string;
  frequency?: number;
}

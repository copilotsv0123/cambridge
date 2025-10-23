export interface Pronunciation {
  pos: string;
  lang: string;
  url: string;
  pron: string;
}

export interface Example {
  id: number;
  text: string;
  translation: string;
}

export interface Definition {
  id: number;
  pos: string;
  source: string | undefined;
  text: string;
  translation: string;
  example: Example[];
}

export interface Verb {
  id: number;
  type: string;
  text: string;
}

export interface DictionaryResponse {
  word: string;
  pos: string[];
  verbs: Verb[];
  pronunciation: Pronunciation[];
  definition: Definition[];
}

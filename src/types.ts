export interface Product {
  shop: string;
  id: string;
  title: string;
  url: string;
  price: number | null; // SEK incl. VAT, as listed by the shop
  inStock: boolean; // buyable right now (incl. open preorders where the shop allows it)
  image?: string;
}

export interface ProductState {
  title: string;
  inStock: boolean;
  price: number | null;
  url?: string;
  firstSeen: string;
  lastAlert?: string;
}

export type State = Record<string, Record<string, ProductState>>; // shop -> id -> state

export type AlertKind = "restock" | "new" | "deal" | "drop";

export interface Alert {
  kind: AlertKind;
  product: Product;
  note?: string;
}

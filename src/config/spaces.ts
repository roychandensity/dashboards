export interface Doorway {
  id: string;
  name: string;
}

export interface Space {
  id: string;
  name: string;
  capacity?: number;
  doorways: Doorway[];
}

export const CUSTOMER_NAME = "Les Mills";

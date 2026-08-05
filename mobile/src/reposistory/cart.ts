import { DbType, JsonCollection } from '../db';
import { Carts } from '../types/core';

type T = Record<'data', Carts>;

const cartDB = new JsonCollection(`carts`, { data: [] } as T);

class CartRepository {
  constructor(private db: DbType) {}
  addCart(name: string): Promise<T> {
    const new_data = {
      uid: crypto.randomUUID(),
      name,
    };

    function updater(prevData: T) {
      return { data: [...prevData.data, new_data] };
    }
    return this.db.update(updater);
  }

  removeCart(uid: ReturnType<typeof crypto.randomUUID>) {
    function updater(prevData: T) {
      return { data: [...prevData.data].filter((d) => d.uid !== uid) };
    }
    return this.db.update(updater);
  }
}

const cartRepository = new CartRepository(cartDB);

export default cartRepository;
export { cartDB };

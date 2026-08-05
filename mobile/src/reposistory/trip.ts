import { DbType, JsonCollection } from '../db';
import { Trip } from '../types/core';

interface data {
  [key: string]: Trip;
}

const createTripEntity = (name: string) => new JsonCollection(`${name}.trips`, {} as data);

function keyGen() {
  const now = new Date().toLocaleDateString().split('/').join(':');
  return now;
}

class TripRepository {
  constructor(private db: DbType) {}
  keyGen() {
    const now = new Date().toLocaleDateString().split('/').join(':');
    return now;
  }

  async createTrip(data: Trip) {
    const key = keyGen();
    function updater(d: data) {
      d[key] = data;
      return d;
    }
    return this.db.update(updater);
  }

  async updateTrip(data: Trip) {
    const key = keyGen();
    function updater(d: data) {
      const u = { ...d[key], ...data };
      return u ? { ...d, [key]: u } : d;
    }
    return this.db.update(updater);
  }

  async getTrip(key: string) {
    return this.db.read().then((d) => d[key]);
  }

  async getAllTrips() {
    return this.db.read().then((d) => d);
  }

  async removeTrip(key: string) {
    function updater(d: data) {
      const { [key]: _, ...rest } = d;
      return rest;
    }
    return this.db.update(updater);
  }

  async getTripDB(name: string) {
    return new JsonCollection(`${name}.trips`, {} as data);
  }
}

const tripRepository = new TripRepository(createTripEntity('trip'));

export { createTripEntity };
export default tripRepository;

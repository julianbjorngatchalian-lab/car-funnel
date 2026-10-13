/*
 * Demo inventory for Indigo Lane Motors (fictional dealer).
 * Prices, mileage, owners and history are invented for the demo.
 * personas: which shopper type each car is suggested for ("first", "family", "commute").
 */
window.INVENTORY = [
  { id: "c01", year: 2019, make: "Honda", model: "Civic", trim: "LX Sedan", body: "Sedan", price: 16900, miles: 48200, drive: "FWD", fuel: "Gas", trans: "Automatic", color: "Lunar Silver", owners: 1, accidents: 0, records: true, personas: ["first", "commute"] },
  { id: "c02", year: 2017, make: "Toyota", model: "Prius", trim: "Two", body: "Hatchback", price: 15400, miles: 71500, drive: "FWD", fuel: "Hybrid", trans: "Automatic", color: "Sea Glass Pearl", owners: 2, accidents: 0, records: true, personas: ["first", "commute"] },
  { id: "c03", year: 2022, make: "Hyundai", model: "Elantra", trim: "SEL", body: "Sedan", price: 19800, miles: 22400, drive: "FWD", fuel: "Gas", trans: "Automatic", color: "Intense Blue", owners: 1, accidents: 0, records: true, personas: ["first", "commute"] },
  { id: "c04", year: 2020, make: "Toyota", model: "Camry", trim: "SE", body: "Sedan", price: 21500, miles: 39800, drive: "FWD", fuel: "Gas", trans: "Automatic", color: "Celestial Silver", owners: 1, accidents: 1, records: true, personas: ["commute"] },
  { id: "c05", year: 2020, make: "Toyota", model: "RAV4 Hybrid", trim: "XLE", body: "SUV", price: 27900, miles: 41300, drive: "AWD", fuel: "Hybrid", trans: "Automatic", color: "Blueprint", owners: 1, accidents: 0, records: true, personas: ["family", "commute"] },
  { id: "c06", year: 2021, make: "Honda", model: "CR-V", trim: "EX AWD", body: "SUV", price: 26400, miles: 33600, drive: "AWD", fuel: "Gas", trans: "Automatic", color: "Obsidian Blue", owners: 1, accidents: 0, records: true, personas: ["family"] },
  { id: "c07", year: 2019, make: "Mazda", model: "CX-5", trim: "Touring", body: "SUV", price: 20900, miles: 52700, drive: "AWD", fuel: "Gas", trans: "Automatic", color: "Soul Red Crystal", owners: 2, accidents: 0, records: false, personas: ["family", "first"] },
  { id: "c08", year: 2021, make: "Honda", model: "Odyssey", trim: "EX-L", body: "Minivan", price: 31800, miles: 36900, drive: "FWD", fuel: "Gas", trans: "Automatic", color: "Modern Steel", owners: 1, accidents: 0, records: true, personas: ["family"] },
  { id: "c09", year: 2020, make: "Kia", model: "Telluride", trim: "EX AWD", body: "SUV", price: 33500, miles: 44100, drive: "AWD", fuel: "Gas", trans: "Automatic", color: "Gravity Gray", owners: 1, accidents: 0, records: true, personas: ["family"] },
  { id: "c10", year: 2020, make: "Subaru", model: "Outback", trim: "Premium", body: "Wagon", price: 22700, miles: 47900, drive: "AWD", fuel: "Gas", trans: "Automatic", color: "Abyss Blue Pearl", owners: 1, accidents: 0, records: true, personas: ["family", "commute"] },
  { id: "c11", year: 2018, make: "Ford", model: "F-150", trim: "XLT SuperCrew 4x4", body: "Truck", price: 27400, miles: 68300, drive: "4WD", fuel: "Gas", trans: "Automatic", color: "Blue Jeans", owners: 2, accidents: 1, records: true, personas: [] },
  { id: "c12", year: 2019, make: "Toyota", model: "Corolla", trim: "LE Sedan", body: "Sedan", price: 15900, miles: 54600, drive: "FWD", fuel: "Gas", trans: "Automatic", color: "Classic Silver", owners: 1, accidents: 0, records: true, personas: ["first", "commute"] }
];

window.PERSONAS = {
  first: {
    name: "First car",
    headline: "Reliable first cars, most under $20,000",
    note: "Affordable, easy to insure, with financing help for first-time buyers."
  },
  family: {
    name: "Family hauler",
    headline: "SUVs, minivans and 3-row seating",
    note: "Room for car seats, cargo and weekend trips, many with all-wheel drive."
  },
  commute: {
    name: "Daily commuter",
    headline: "Sedans and hybrids for the daily drive",
    note: "Comfortable, efficient and low on running costs."
  }
};

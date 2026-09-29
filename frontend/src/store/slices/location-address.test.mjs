import assert from "node:assert/strict";
import test from "node:test";

import { resolveCurrentLocationAddress } from "./location-address.ts";

test("shows street, Sector V and Kolkata without district or country", () => {
  const resolved = resolveCurrentLocationAddress({
    city: "Bidhannagar",
    district: "North 24 Parganas",
    formattedAddress: "Street Number 10, DN Block, Sector V, Bidhannagar, Kolkata, Bidhannagar, West Bengal 700091, India",
    name: "Street Number 10",
    postalCode: "700091",
    region: "West Bengal",
    street: "Street Number 10",
    streetNumber: null,
  });

  assert.deepEqual(resolved, {
    city: "Kolkata",
    displayAddress: "Street Number 10, Sector V, Kolkata 700091",
    locality: "Sector V",
    searchHint: "Sector V, Kolkata",
  });
});

test("does not invent an area that the device did not return", () => {
  const resolved = resolveCurrentLocationAddress({
    city: "Bidhannagar",
    district: "North 24 Parganas",
    formattedAddress: "Street Number 10, Bidhannagar, West Bengal 700091, India",
    name: null,
    postalCode: "700091",
    region: "West Bengal",
    street: "Street Number 10",
    streetNumber: null,
  });

  assert.equal(resolved.displayAddress, "Street Number 10, Kolkata 700091");
  assert.equal(resolved.locality, null);
});

test("does not use North 24 Parganas as the city when Kolkata is present", () => {
  const resolved = resolveCurrentLocationAddress({
    city: "North 24 Parganas",
    district: "North 24 Parganas",
    formattedAddress: "Street Number 10, DN Block, Sector V, Kolkata, West Bengal 700091, India",
    name: null,
    postalCode: "700091",
    region: "West Bengal",
    street: "Street Number 10",
    streetNumber: null,
  });

  assert.equal(resolved.city, "Kolkata");
  assert.equal(resolved.locality, "Sector V");
});

test("uses the area before a regular city without showing state or country", () => {
  const resolved = resolveCurrentLocationAddress({
    city: "Hyderabad",
    district: "Rangareddy",
    formattedAddress: "12, Gachibowli, Hyderabad, Telangana 500032, India",
    name: null,
    postalCode: "500032",
    region: "Telangana",
    street: "Main Road",
    streetNumber: "12",
  });

  assert.deepEqual(resolved, {
    city: "Hyderabad",
    displayAddress: "12 Main Road, Gachibowli, Hyderabad 500032",
    locality: "Gachibowli",
    searchHint: "Gachibowli, Hyderabad",
  });
});

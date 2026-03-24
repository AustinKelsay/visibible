import { describe, expect, it } from "vitest";
import {
  getBitcoinUri,
  getCashAppPathDeepLinks,
  getCashAppSingleParamDeepLinks,
  getCashAppWrappedUriDeepLinks,
  getLightningUri,
} from "@/lib/lightning-deeplinks";

describe("lightning deeplinks", () => {
  const bolt11 = "lnbc1testinvoice";

  it("builds a lightning URI", () => {
    expect(getLightningUri(bolt11)).toBe("lightning:lnbc1testinvoice");
  });

  it("builds a BIP-321 bitcoin URI", () => {
    expect(getBitcoinUri(bolt11)).toBe("bitcoin:?lightning=lnbc1testinvoice");
  });

  it("builds single-param Cash App deep link candidates", () => {
    expect(getCashAppSingleParamDeepLinks(bolt11)).toEqual([
      "cashme://pay?invoice=lnbc1testinvoice",
      "cashme://pay?lightning=lnbc1testinvoice",
      "cashme://pay?bolt11=lnbc1testinvoice",
      "squarecash://pay?invoice=lnbc1testinvoice",
      "squarecash://pay?lightning=lnbc1testinvoice",
      "squarecash://pay?bolt11=lnbc1testinvoice",
      "https://cash.app/pay/lightning?invoice=lnbc1testinvoice",
      "https://cash.app/pay/lightning?lightning=lnbc1testinvoice",
      "https://cash.app/pay/lightning?bolt11=lnbc1testinvoice",
      "https://cash.app/pay/bitcoin?invoice=lnbc1testinvoice",
      "https://cash.app/pay/bitcoin?lightning=lnbc1testinvoice",
      "https://cash.app/pay/bitcoin?bolt11=lnbc1testinvoice",
      "https://cash.app/launch/pay?invoice=lnbc1testinvoice",
      "https://cash.app/launch/pay?lightning=lnbc1testinvoice",
      "https://cash.app/launch/pay?bolt11=lnbc1testinvoice",
      "cashme://bitcoin?invoice=lnbc1testinvoice",
      "cashme://bitcoin?lightning=lnbc1testinvoice",
      "cashme://bitcoin?bolt11=lnbc1testinvoice",
      "squarecash://bitcoin?invoice=lnbc1testinvoice",
      "squarecash://bitcoin?lightning=lnbc1testinvoice",
      "squarecash://bitcoin?bolt11=lnbc1testinvoice",
      "https://cash.app/launch/bitcoin?invoice=lnbc1testinvoice",
      "https://cash.app/launch/bitcoin?lightning=lnbc1testinvoice",
      "https://cash.app/launch/bitcoin?bolt11=lnbc1testinvoice",
    ]);
  });

  it("builds path-style Cash App deep link candidates", () => {
    expect(getCashAppPathDeepLinks(bolt11)).toEqual([
      "cashme://pay/lnbc1testinvoice",
      "cashme://bitcoin/lnbc1testinvoice",
      "squarecash://pay/lnbc1testinvoice",
      "squarecash://bitcoin/lnbc1testinvoice",
      "https://cash.app/pay/lnbc1testinvoice",
      "https://cash.app/launch/pay/lnbc1testinvoice",
      "https://cash.app/launch/bitcoin/lnbc1testinvoice",
    ]);
  });

  it("builds wrapped-URI Cash App deep link candidates", () => {
    expect(getCashAppWrappedUriDeepLinks(bolt11)).toEqual([
      "cashme://pay?uri=bitcoin%3A%3Flightning%3Dlnbc1testinvoice",
      "cashme://pay?request=bitcoin%3A%3Flightning%3Dlnbc1testinvoice",
      "cashme://pay?url=lightning%3Alnbc1testinvoice",
      "squarecash://pay?uri=bitcoin%3A%3Flightning%3Dlnbc1testinvoice",
      "squarecash://pay?request=bitcoin%3A%3Flightning%3Dlnbc1testinvoice",
      "squarecash://pay?url=lightning%3Alnbc1testinvoice",
      "https://cash.app/pay/lightning?uri=bitcoin%3A%3Flightning%3Dlnbc1testinvoice",
      "https://cash.app/pay/lightning?request=bitcoin%3A%3Flightning%3Dlnbc1testinvoice",
      "https://cash.app/pay/lightning?url=lightning%3Alnbc1testinvoice",
      "https://cash.app/pay/bitcoin?uri=bitcoin%3A%3Flightning%3Dlnbc1testinvoice",
      "https://cash.app/pay/bitcoin?request=bitcoin%3A%3Flightning%3Dlnbc1testinvoice",
      "https://cash.app/pay/bitcoin?url=lightning%3Alnbc1testinvoice",
      "https://cash.app/launch/pay?uri=bitcoin%3A%3Flightning%3Dlnbc1testinvoice",
      "https://cash.app/launch/pay?request=bitcoin%3A%3Flightning%3Dlnbc1testinvoice",
      "https://cash.app/launch/pay?url=lightning%3Alnbc1testinvoice",
    ]);
  });

  it("trims invoices before building URIs", () => {
    expect(getLightningUri(` ${bolt11} `)).toBe("lightning:lnbc1testinvoice");
  });
});

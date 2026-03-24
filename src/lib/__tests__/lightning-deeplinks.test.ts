import { describe, expect, it } from "vitest";
import {
  getBitcoinUri,
  getCashAppDeepLinks,
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

  it("builds Cash App deep link candidates with invoice query params", () => {
    expect(getCashAppDeepLinks(bolt11)).toEqual([
      "cashme://pay?lightning=lnbc1testinvoice&invoice=lnbc1testinvoice&bolt11=lnbc1testinvoice",
      "squarecash://pay?lightning=lnbc1testinvoice&invoice=lnbc1testinvoice&bolt11=lnbc1testinvoice",
      "https://cash.app/pay/lightning?lightning=lnbc1testinvoice&invoice=lnbc1testinvoice&bolt11=lnbc1testinvoice",
      "https://cash.app/pay/bitcoin?lightning=lnbc1testinvoice&invoice=lnbc1testinvoice&bolt11=lnbc1testinvoice",
      "https://cash.app/launch/pay?lightning=lnbc1testinvoice&invoice=lnbc1testinvoice&bolt11=lnbc1testinvoice",
      "cashme://bitcoin?lightning=lnbc1testinvoice&invoice=lnbc1testinvoice&bolt11=lnbc1testinvoice",
      "squarecash://bitcoin?lightning=lnbc1testinvoice&invoice=lnbc1testinvoice&bolt11=lnbc1testinvoice",
      "https://cash.app/launch/bitcoin?lightning=lnbc1testinvoice&invoice=lnbc1testinvoice&bolt11=lnbc1testinvoice",
    ]);
  });

  it("trims invoices before building URIs", () => {
    expect(getLightningUri(` ${bolt11} `)).toBe("lightning:lnbc1testinvoice");
  });
});

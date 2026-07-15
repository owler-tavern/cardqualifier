import test from "node:test";
import assert from "node:assert/strict";
import { isBlockedUrl, isBlockedHost } from "../src/ssrf-guard.mjs";

test("allows ordinary public https/http image urls", () => {
  assert.equal(isBlockedUrl("https://images.example.com/a.jpg"), false);
  assert.equal(isBlockedUrl("http://cdn.example.org/b.png"), false);
});

test("blocks non-http(s) schemes and malformed urls", () => {
  for (const u of ["file:///etc/passwd", "ftp://host/x", "data:image/png;base64,AAAA", "not a url"]) {
    assert.equal(isBlockedUrl(u), true, u);
  }
});

test("blocks loopback, private, and link-local hosts", () => {
  for (const h of ["localhost", "127.0.0.1", "0.0.0.0", "10.1.2.3", "172.16.9.9", "192.168.0.1", "169.254.1.1", "::1", "fd00::1", "fe80::1"]) {
    assert.equal(isBlockedHost(h), true, h);
  }
});

test("allows public hosts and IPs", () => {
  for (const h of ["example.com", "8.8.8.8", "172.15.0.1", "172.32.0.1"]) {
    assert.equal(isBlockedHost(h), false, h);
  }
});

test("does not over-block domains that merely start with fc/fd/fe80", () => {
  // IPv6 ULA/link-local rules must only apply to actual IPv6 literals (which
  // contain a colon), not to real domains like fc2.com.
  for (const h of ["fc2.com", "fd-media.example", "fe80host.example.com"]) {
    assert.equal(isBlockedHost(h), false, h);
  }
  // but genuine IPv6 ULA / link-local literals stay blocked.
  for (const h of ["fd00::1", "fe80::1", "::1"]) {
    assert.equal(isBlockedHost(h), true, h);
  }
});
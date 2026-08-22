/**
 * `request<T>()` behaviour against MSW (REFRESH task 15, step 1).
 *
 * Pins the transport contract: timeout → TimeoutError; caller abort →
 * unwrapped AbortError; non-JSON error body → clean fallback; 204 →
 * `undefined`; status→kind mapping; query building; no fabricated values.
 */
import { describe, expect, it } from "vitest";
import { HttpResponse, delay, http } from "msw";

import { server } from "@test/mswServer";
import { request } from "@api/client/httpClient";
import {
  ApiError,
  NetworkError,
  TimeoutError,
  isApiError,
  isKind,
} from "@api/client/errors";

describe("URL building", () => {
  it("encodes query values and skips undefined ones", async () => {
    let seenUrl = "";
    server.use(
      http.get("*/api/echo", ({ request: req }) => {
        seenUrl = req.url;
        return HttpResponse.json({ ok: true });
      }),
    );
    await request({
      path: "/echo",
      query: { name: "Base Unit", skip: undefined, n: 3 },
    });
    expect(seenUrl).toContain("name=Base%20Unit");
    expect(seenUrl).toContain("n=3");
    expect(seenUrl).not.toContain("skip");
  });

  it("omits the query string entirely when every value is undefined", async () => {
    let seenUrl = "";
    server.use(
      http.get("*/api/echo", ({ request: req }) => {
        seenUrl = req.url;
        return HttpResponse.json({ ok: true });
      }),
    );
    await request({ path: "/echo", query: { name: undefined } });
    expect(seenUrl).not.toContain("?");
  });
});

describe("timeout", () => {
  it("throws TimeoutError (kind 'timeout') when the internal deadline fires", async () => {
    server.use(
      http.get("*/api/slow", async () => {
        await delay(300);
        return HttpResponse.json({ ok: true });
      }),
    );
    const err = await request({ path: "/slow", timeoutMs: 30 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(TimeoutError);
    expect(isKind(err, "timeout")).toBe(true);
  });
});

describe("caller abort", () => {
  it("rethrows the AbortError UNWRAPPED — not an ApiError", async () => {
    server.use(
      http.get("*/api/slow", async () => {
        await delay(300);
        return HttpResponse.json({ ok: true });
      }),
    );
    const controller = new AbortController();
    const pending = request({ path: "/slow", signal: controller.signal });
    controller.abort();
    const err = await pending.then(
      () => null,
      (e: unknown) => e,
    );
    expect(isApiError(err)).toBe(false);
    expect((err as Error).name).toBe("AbortError");
  });

  it("throws immediately for an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const err = await request({
      path: "/never",
      signal: controller.signal,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isApiError(err)).toBe(false);
    expect((err as Error).name).toBe("AbortError");
  });
});

describe("error mapping", () => {
  it.each([
    [400, "validation"],
    [404, "notFound"],
    [409, "conflict"],
    [500, "server"],
    [502, "server"],
  ] as const)("%i → kind '%s'", async (status, kind) => {
    server.use(
      http.get("*/api/fail", () =>
        HttpResponse.json({ error: `boom ${status}` }, { status }),
      ),
    );
    const err = await request({ path: "/fail" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isKind(err, kind)).toBe(true);
    expect((err as ApiError).status).toBe(status);
    expect((err as ApiError).serverMessage).toBe(`boom ${status}`);
    expect((err as ApiError).path).toBe("/fail");
  });

  it("wraps a fetch rejection as NetworkError (kind 'network')", async () => {
    server.use(http.get("*/api/down", () => HttpResponse.error()));
    const err = await request({ path: "/down" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(NetworkError);
    expect(isKind(err, "network")).toBe(true);
    expect((err as ApiError).status).toBeUndefined();
  });

  it("falls back cleanly when the error body is HTML, keeping the real status", async () => {
    server.use(
      http.get(
        "*/api/proxy502",
        () =>
          new HttpResponse("<html><body>Bad Gateway</body></html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );
    const err = await request({ path: "/proxy502" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isKind(err, "server")).toBe(true);
    expect((err as ApiError).status).toBe(502);
    expect((err as ApiError).serverMessage).toContain("Bad Gateway");
  });

  it("throws (kind 'unknown') for a 2xx body that is not valid JSON — never a fabricated value", async () => {
    server.use(
      http.get(
        "*/api/garbage",
        () =>
          new HttpResponse("definitely-not-json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const err = await request({ path: "/garbage" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isKind(err, "unknown")).toBe(true);
  });
});

describe("empty responses", () => {
  it("resolves undefined for a 204", async () => {
    server.use(
      http.delete("*/api/thing", () => new HttpResponse(null, { status: 204 })),
    );
    await expect(
      request({ method: "DELETE", path: "/thing" }),
    ).resolves.toBeUndefined();
  });
});

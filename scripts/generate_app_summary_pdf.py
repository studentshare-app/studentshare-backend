from pathlib import Path


PAGE_W = 612
PAGE_H = 792


def pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_stream() -> str:
    lines: list[str] = []

    def rect(x: float, y: float, w: float, h: float, rgb: tuple[float, float, float]) -> None:
        r, g, b = rgb
        lines.append(f"{r:.3f} {g:.3f} {b:.3f} rg")
        lines.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re f")

    def text(x: float, y: float, value: str, size: int = 10, font: str = "/F1", rgb: tuple[float, float, float] = (0.10, 0.14, 0.22)) -> None:
        r, g, b = rgb
        lines.append("BT")
        lines.append(f"{font} {size} Tf")
        lines.append(f"{r:.3f} {g:.3f} {b:.3f} rg")
        lines.append(f"1 0 0 1 {x:.2f} {y:.2f} Tm")
        lines.append(f"({pdf_escape(value)}) Tj")
        lines.append("ET")

    navy = (0.07, 0.12, 0.22)
    blue = (0.10, 0.34, 0.86)
    slate = (0.32, 0.38, 0.48)
    text_color = (0.09, 0.12, 0.17)
    rule = (0.85, 0.89, 0.95)
    white = (1.0, 1.0, 1.0)

    rect(0, 0, PAGE_W, PAGE_H, white)
    rect(0, PAGE_H - 118, PAGE_W, 118, navy)
    rect(44, PAGE_H - 128, 180, 6, blue)

    text(44, 736, "StudentShare", 24, "/F2", white)
    text(44, 716, "One-page repo summary", 10, "/F1", (0.84, 0.90, 1.0))
    text(44, 694, "Evidence source: app routes, providers, schema, sync layer, and backend/server.js", 9, "/F1", (0.78, 0.85, 0.95))

    y = 650

    def section(title: str) -> None:
        nonlocal y
        text(44, y, title.upper(), 10, "/F2", blue)
        y -= 7
        rect(44, y, 524, 1, rule)
        y -= 18

    def body_line(value: str, size: int = 10, color: tuple[float, float, float] = text_color, font: str = "/F1") -> None:
        nonlocal y
        text(52, y, value, size, font, color)
        y -= 14

    section("What it is")
    body_line("StudentShare is an Expo Router mobile app for students to discover study materials,")
    body_line("track coursework, chat, join a campus forum, and manage premium access.")

    section("Who it's for")
    body_line("Primary persona: a college or class-based student who needs course materials,")
    body_line("offline access, study tools, and a peer community in one app.")

    section("What it does")
    for item in [
        "Home dashboard with quick actions, deadlines, study planner, and leaderboard preview.",
        "Course and materials browsing with online viewing, offline caching, bookmarks, and downloads.",
        "AI tutor chat tied to a material or general study help.",
        "StudentSquare forum with posts, replies, media, polls, search, bookmarks, and notifications.",
        "Notes, conversations, profile management, and college or class setup flows.",
        "Premium subscriptions and payment flow using Monime through a hosted Express backend.",
    ]:
        body_line(f"- {item}")

    section("How it works")
    for item in [
        "Client: Expo Router app; RootLayout controls onboarding, auth, sync, and route handoff.",
        "Auth and backend data: Supabase with PKCE auth, profiles, subscriptions, realtime, and queries.",
        "Local data: WatermelonDB stores users, courses, materials, posts, messages, notes, and sync_queue.",
        "Offline-first flow: local reads come from WatermelonDB or AsyncStorage; syncService pushes queued writes and pulls updates from Supabase when online.",
        "Premium flow: app opens Monime checkout via backend/server.js; webhook or admin approval updates Supabase subscriptions and profiles.is_premium.",
    ]:
        body_line(f"- {item}")

    section("How to run")
    for item in [
        "1. Run `npm install`.",
        "2. Create `.env` from `.env.example` and set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and EXPO_PUBLIC_PROJECT_ID.",
        "3. Start the app with `npm start` (or `npm run android`, `npm run ios`, or `npm run web`).",
        "4. Local backend start command: Not found in repo. PaymentScreen points to hosted backend `https://studentshare-backend.onrender.com`.",
    ]:
        body_line(item)

    text(44, 40, "Not found in repo: a meaningful README, backend package script, or an official deployment overview.", 8, "/F1", slate)

    return "\n".join(lines) + "\n"


def build_pdf_bytes(stream: bytes) -> bytes:
    objects: list[bytes] = []

    def add_object(body: bytes) -> None:
        objects.append(body)

    add_object(b"<< /Type /Catalog /Pages 2 0 R >>")
    add_object(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    add_object(
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
        f"/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>".encode("ascii")
    )
    add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    add_object(b"<< /Length %d >>\nstream\n%sendstream" % (len(stream), stream))

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for idx, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out.extend(f"{idx} 0 obj\n".encode("ascii"))
        out.extend(body)
        out.extend(b"\nendobj\n")

    xref_offset = len(out)
    out.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    out.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
    out.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    return bytes(out)


def main() -> None:
    output_dir = Path("output/pdf")
    output_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = output_dir / "studentshare-app-summary.pdf"
    stream = build_stream().encode("utf-8")
    pdf_path.write_bytes(build_pdf_bytes(stream))
    print(pdf_path.resolve())


if __name__ == "__main__":
    main()

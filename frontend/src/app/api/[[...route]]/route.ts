// The only frontend file allowed to import @archie/backend (docs/04, ADR-001).
import { app } from "@archie/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const handler = (req: Request) => app.fetch(req);

export const GET = handler;
export const POST = handler;

#!/usr/bin/env node
// Entry point: registers the TypeScript loader, then runs the CLI from source.
import { register } from "tsx/esm/api";

register();
await import("../src/cli.ts");

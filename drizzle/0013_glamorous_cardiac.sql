ALTER TABLE "log_movimientos" ADD COLUMN IF NOT EXISTS "template_nombre" text;--> statement-breakpoint
ALTER TABLE "log_movimientos" ADD COLUMN IF NOT EXISTS "mensaje_enviado" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "log_movimientos_ts_idx" ON "log_movimientos" USING btree ("ts");

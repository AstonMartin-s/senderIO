ALTER TABLE "log_movimientos" ADD COLUMN "template_nombre" text;--> statement-breakpoint
ALTER TABLE "log_movimientos" ADD COLUMN "mensaje_enviado" text;--> statement-breakpoint
CREATE INDEX "log_movimientos_ts_idx" ON "log_movimientos" USING btree ("ts");
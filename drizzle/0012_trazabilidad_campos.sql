ALTER TABLE "log_movimientos" ADD COLUMN IF NOT EXISTS "template_nombre" text;--> statement-breakpoint
ALTER TABLE "log_movimientos" ADD COLUMN IF NOT EXISTS "mensaje_enviado" text;

import { NextResponse } from 'next/server'

/** Verificação simples de saúde (monitoramento, n8n). */
export function GET() {
  return NextResponse.json({ ok: true, app: 'prometheus-crm', versao: '1.0.0', hora: new Date().toISOString() })
}

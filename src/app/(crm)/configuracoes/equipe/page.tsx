import type { Metadata } from 'next'

import { ActionButton } from '@/components/ui/action-button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ListaMobile } from '@/components/ui/lista-mobile'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { atualizarAcessoMembro } from '@/features/configuracoes/actions'
import { CabecalhoConfiguracoes } from '@/features/configuracoes/components/cabecalho'
import { FormularioCadastroMembro, FormularioMeuPerfil } from '@/features/configuracoes/components/formularios'
import { BotaoNovaSenha } from '@/features/configuracoes/components/senha-temporaria'
import { listarEquipe } from '@/features/configuracoes/queries'
import { exigirEquipe } from '@/lib/auth'
import type { Perfil } from '@/types'

export const metadata: Metadata = { title: 'Equipe' }

function BadgeAcesso({ membro }: { membro: Perfil }) {
  if (!membro.ativo) return <Badge tom="alerta" ponto>Aguardando</Badge>
  if (membro.trocar_senha) return <Badge ponto>Senha temporária</Badge>
  return <Badge tom="sucesso" ponto>Ativo</Badge>
}

export default async function PaginaEquipe() {
  const { perfil } = await exigirEquipe()
  const equipe = await listarEquipe()
  const ehAdmin = perfil.papel === 'admin'

  return (
    <>
      <CabecalhoConfiguracoes ativa="equipe" />
      <div className="grid gap-5 lg:gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="self-start">
          <CardHeader titulo="Membros" descricao="Contas criadas fora do cadastro ficam inativas até um administrador liberar." />
          <ListaMobile>
            {equipe.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar nome={m.nome || m.email} variante={m.ativo ? 'volt' : 'claro'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">
                      {m.nome || '—'} {m.id === perfil.id && <span className="text-[12px] font-normal text-suave">(você)</span>}
                    </p>
                    <p className="truncate text-[13px] text-suave">{m.email}{m.cargo && ` · ${m.cargo}`}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {m.papel === 'admin' ? <Badge tom="escuro">Admin</Badge> : <Badge>Equipe</Badge>}
                    <BadgeAcesso membro={m} />
                  </div>
                </div>
                {ehAdmin && m.id !== perfil.id && (
                  <div className="mt-3 grid grid-cols-2 gap-2 *:w-full">
                    <ActionButton acao={atualizarAcessoMembro.bind(null, m.id, { ativo: !m.ativo })} variante={m.ativo ? 'secundario' : 'primario'}>
                      {m.ativo ? 'Bloquear' : 'Liberar acesso'}
                    </ActionButton>
                    <ActionButton acao={atualizarAcessoMembro.bind(null, m.id, { papel: m.papel === 'admin' ? 'equipe' : 'admin' })}>
                      {m.papel === 'admin' ? 'Tornar equipe' : 'Tornar admin'}
                    </ActionButton>
                    <div className="col-span-2">
                      <BotaoNovaSenha id={m.id} nome={m.nome || m.email || 'membro'} className="w-full" />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ListaMobile>
          <Table somenteDesktop>
            <THead>
              <TR>
                <TH>Pessoa</TH>
                <TH>Papel</TH>
                <TH>Acesso</TH>
                {ehAdmin && <TH className="text-right">Ações</TH>}
              </TR>
            </THead>
            <TBody>
              {equipe.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar nome={m.nome || m.email} tamanho="sm" variante={m.ativo ? 'volt' : 'claro'} />
                      <div>
                        <p className="font-semibold">
                          {m.nome || '—'} {m.id === perfil.id && <span className="text-[12px] font-normal text-suave">(você)</span>}
                        </p>
                        <p className="text-[13px] text-suave">{m.email}{m.cargo && ` · ${m.cargo}`}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>{m.papel === 'admin' ? <Badge tom="escuro">Admin</Badge> : <Badge>Equipe</Badge>}</TD>
                  <TD><BadgeAcesso membro={m} /></TD>
                  {ehAdmin && (
                    <TD>
                      {m.id !== perfil.id && (
                        <div className="flex justify-end gap-1.5">
                          <ActionButton acao={atualizarAcessoMembro.bind(null, m.id, { ativo: !m.ativo })} variante={m.ativo ? 'secundario' : 'primario'}>
                            {m.ativo ? 'Bloquear' : 'Liberar acesso'}
                          </ActionButton>
                          <ActionButton acao={atualizarAcessoMembro.bind(null, m.id, { papel: m.papel === 'admin' ? 'equipe' : 'admin' })}>
                            {m.papel === 'admin' ? 'Tornar equipe' : 'Tornar admin'}
                          </ActionButton>
                          <BotaoNovaSenha id={m.id} nome={m.nome || m.email || 'membro'} />
                        </div>
                      )}
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <div className="space-y-6">
          {ehAdmin && (
            <Card>
              <CardHeader
                titulo="Cadastrar pessoa"
                descricao="O CRM gera uma senha temporária para você repassar. No primeiro acesso, a pessoa cria a própria senha."
              />
              <CardContent>
                <FormularioCadastroMembro />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader titulo="Meu perfil" />
            <CardContent>
              <FormularioMeuPerfil perfil={perfil} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

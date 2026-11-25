'use client'

import { Save } from 'lucide-react'
import { useState } from 'react'

import { ActionForm, SubmitButton, type AcaoFormulario } from '@/components/form/action-form'
import { Field, FormActions, FormSection, Input, MoneyInput, Select, Textarea } from '@/components/form/fields'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatarMoeda, formatarWhatsapp } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Influenciador } from '@/types'

import { TIPOS_CHAVE_PIX } from '../rotulos'

const paraCampo = (valor: number | null | undefined) => (valor === null || valor === undefined ? '' : String(Number(valor)).replace('.', ','))

/** Campo de porcentagem: número com o "%" fixo à direita. */
function CampoPercentual({ name, defaultValue, autoFocus }: { name: string; defaultValue?: string; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Input name={name} inputMode="decimal" autoComplete="off" defaultValue={defaultValue} autoFocus={autoFocus} className="tipo-dado pr-9" />
      <span className="tipo-dado pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-suave">%</span>
    </div>
  )
}

function CamposPix({ tipo, chave, recebedor, documento }: { tipo?: string | null; chave?: string | null; recebedor?: string | null; documento?: string | null }) {
  return (
    <>
      <Field label="Tipo da chave PIX" name="tipo_chave_pix" className="sm:col-span-2">
        <Select name="tipo_chave_pix" defaultValue={tipo ?? ''}>
          <option value="">Sem chave ainda</option>
          {Object.entries(TIPOS_CHAVE_PIX).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>{rotulo}</option>
          ))}
        </Select>
      </Field>
      <Field label="Chave PIX" name="chave_pix" className="sm:col-span-4">
        <Input name="chave_pix" autoComplete="off" spellCheck={false} defaultValue={chave ?? ''} />
      </Field>
      <Field label="Nome de quem recebe" name="nome_recebedor" className="sm:col-span-4" dica="Como aparece no banco, para conferir na hora do PIX.">
        <Input name="nome_recebedor" defaultValue={recebedor ?? ''} />
      </Field>
      <Field label="CPF ou CNPJ" name="documento" className="sm:col-span-2">
        <Input name="documento" inputMode="numeric" autoComplete="off" defaultValue={documento ?? ''} />
      </Field>
    </>
  )
}

/** Cadastro e edição do influenciador. O cupom só é escolhido na criação. */
export function FormularioInfluenciador({
  acao,
  influenciador,
  padroes,
  hoje,
}: {
  acao: AcaoFormulario
  influenciador?: Influenciador | null
  padroes: { comissao: number; desconto: number; criaCupomSozinho: boolean }
  hoje: string
}) {
  const [nome, setNome] = useState(influenciador?.nome ?? '')
  const [cupom, setCupom] = useState(influenciador?.cupom ?? '')
  const [cupomEditado, setCupomEditado] = useState(false)
  const voltar = influenciador ? `/influenciadores/${influenciador.id}` : '/influenciadores/lista'

  /** Sugestão do cupom: primeiro nome + desconto ("LU10"). Para de sugerir quando a pessoa digita o próprio. */
  const sugerir = (novoNome: string) => {
    const base = novoNome.trim().split(/\s+/)[0]?.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 14) ?? ''
    return base.length >= 2 ? `${base}${Math.round(padroes.desconto)}` : ''
  }

  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Quem é" descricao="O e-mail é o login do Portal, onde o influenciador acompanha as vendas e as comissões.">
          <Field label="Nome" name="nome" obrigatorio className="sm:col-span-6">
            <Input
              name="nome"
              value={nome}
              autoFocus={!influenciador}
              onChange={(e) => {
                setNome(e.target.value)
                if (!influenciador && !cupomEditado) setCupom(sugerir(e.target.value))
              }}
            />
          </Field>
          <Field label="E-mail" name="email" obrigatorio className="sm:col-span-3">
            <Input name="email" type="email" autoComplete="off" defaultValue={influenciador?.email ?? ''} placeholder="nome@email.com" />
          </Field>
          <Field label="WhatsApp" name="whatsapp" className="sm:col-span-3">
            <Input name="whatsapp" type="tel" defaultValue={influenciador?.whatsapp ? formatarWhatsapp(influenciador.whatsapp) : ''} placeholder="(11) 98765-4321" />
          </Field>
          <Field label="Instagram" name="instagram" className="sm:col-span-3">
            <Input name="instagram" autoComplete="off" spellCheck={false} defaultValue={influenciador?.instagram ? `@${influenciador.instagram}` : ''} placeholder="@usuario" />
          </Field>
        </FormSection>

        <FormSection
          titulo="Cupom e comissão"
          descricao={
            influenciador
              ? 'O código do cupom não muda depois de criado. Mudar a comissão vale só para os pedidos novos.'
              : padroes.criaCupomSozinho
                ? 'O cupom é criado na Shopify ao salvar. Se o código já existir lá, ele é ligado a este influenciador como está.'
                : 'O CRM ainda não cria cupons na Shopify: depois de salvar, a tela mostra como criar este cupom por lá.'
          }
        >
          <Field
            label="Código do cupom"
            name={influenciador ? undefined : 'cupom'}
            obrigatorio={!influenciador}
            className="sm:col-span-2"
            dica={influenciador ? undefined : 'Letras e números, sem espaços.'}
          >
            {influenciador ? (
              <Input value={influenciador.cupom} disabled readOnly className="tipo-dado uppercase" />
            ) : (
              <Input
                name="cupom"
                value={cupom}
                maxLength={20}
                autoComplete="off"
                spellCheck={false}
                className="tipo-dado uppercase"
                placeholder="LU10"
                onChange={(e) => {
                  setCupomEditado(true)
                  setCupom(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                }}
              />
            )}
          </Field>
          <Field label="Desconto para o cliente" name="desconto_percentual" obrigatorio className="sm:col-span-2" dica="Quanto o cupom tira do pedido.">
            <CampoPercentual name="desconto_percentual" defaultValue={paraCampo(influenciador?.desconto_percentual ?? padroes.desconto)} />
          </Field>
          <Field label="Comissão do influenciador" name="comissao_percentual" obrigatorio className="sm:col-span-2" dica="Sobre os produtos, depois do desconto e sem o frete.">
            <CampoPercentual name="comissao_percentual" defaultValue={paraCampo(influenciador?.comissao_percentual ?? padroes.comissao)} />
          </Field>
          <Field
            label="Contar vendas a partir de"
            name="contar_desde"
            obrigatorio
            className="sm:col-span-3"
            dica="Se o cupom já era usado antes, só os pedidos desta data em diante geram comissão."
          >
            <Input name="contar_desde" type="date" max={hoje} defaultValue={influenciador?.contar_desde ?? hoje} />
          </Field>
        </FormSection>

        <FormSection titulo="Como recebe" descricao="A chave PIX usada nos repasses. O influenciador também pode preencher pelo Portal.">
          <CamposPix tipo={influenciador?.tipo_chave_pix} chave={influenciador?.chave_pix} recebedor={influenciador?.nome_recebedor} documento={influenciador?.documento} />
        </FormSection>

        <FormSection titulo="Anotações" descricao="Só a equipe vê.">
          <Field label="Observações" name="observacoes" className="sm:col-span-6">
            <Textarea name="observacoes" defaultValue={influenciador?.observacoes ?? ''} placeholder="Combinado da parceria, público, envio de produtos..." />
          </Field>
        </FormSection>

        <FormActions>
          <ButtonLink href={voltar} variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>{influenciador ? 'Salvar alterações' : 'Cadastrar influenciador'}</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}

/** Repasse: quita todas as comissões disponíveis; o ajuste (opcional) entra na conta e aparece para o influenciador. */
export function FormularioPagamento({
  acao,
  disponivel,
  vendas,
  chavePix,
  hoje,
}: {
  acao: AcaoFormulario
  disponivel: number
  vendas: number
  chavePix: string | null
  hoje: string
}) {
  const [comAjuste, setComAjuste] = useState(disponivel <= 0)
  const [sentido, setSentido] = useState<'somar' | 'descontar'>(disponivel <= 0 ? 'somar' : 'descontar')
  const [valor, setValor] = useState('')

  const ajuste = comAjuste ? (Number(valor.replace(/\./g, '').replace(',', '.')) || 0) * (sentido === 'somar' ? 1 : -1) : 0
  const total = Math.round((disponivel + ajuste) * 100) / 100

  return (
    <ActionForm action={acao} className="space-y-4" limparAoConcluir aoConcluir={() => setValor('')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-papel p-4">
          <p className="tipo-rotulo text-suave">Comissões disponíveis</p>
          <p className="tipo-numero mt-1 text-[26px] leading-8">{formatarMoeda(disponivel)}</p>
          <p className="text-[13px] text-suave">{vendas === 0 ? 'Nenhuma venda liberada agora.' : `${vendas} venda(s) já liberada(s).`}</p>
        </div>
        <div className={cn('rounded-xl p-4', total < 0 ? 'bg-perigo-50' : 'bg-volt-50')}>
          <p className={cn('tipo-rotulo', total < 0 ? 'text-perigo' : 'text-volt-700')}>Valor do PIX</p>
          <p className="tipo-numero mt-1 text-[26px] leading-8">{formatarMoeda(total)}</p>
          <p className="truncate text-[13px] text-suave">{chavePix ? `Chave: ${chavePix}` : 'Sem chave PIX cadastrada.'}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Data do repasse" name="pago_em" obrigatorio className="sm:col-span-2">
          <Input name="pago_em" type="date" max={hoje} defaultValue={hoje} />
        </Field>
        <Field label="Observação" name="observacoes" className="sm:col-span-4" dica="Aparece para o influenciador (ex.: identificador do PIX).">
          <Input name="observacoes" autoComplete="off" />
        </Field>
      </div>

      {comAjuste ? (
        <div className="grid gap-4 rounded-xl border border-linha p-4 sm:grid-cols-6">
          <Field label="Ajuste" name="ajuste_sentido" className="sm:col-span-2">
            <Select name="ajuste_sentido" value={sentido} onChange={(e) => setSentido(e.target.value as 'somar' | 'descontar')}>
              <option value="descontar">Descontar do repasse</option>
              <option value="somar">Somar ao repasse</option>
            </Select>
          </Field>
          <Field label="Valor do ajuste" name="ajuste_valor" className="sm:col-span-2">
            <MoneyInput name="ajuste_valor" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Field>
          <Field label="Motivo" name="ajuste_motivo" className="sm:col-span-6" dica="Ex.: pedido estornado depois do repasse anterior; bônus da campanha de inverno.">
            <Input name="ajuste_motivo" autoComplete="off" maxLength={300} />
          </Field>
        </div>
      ) : (
        <button type="button" onClick={() => setComAjuste(true)} className="text-sm font-semibold text-volt-700 hover:text-ink">
          + Somar ou descontar um valor (bônus, estorno…)
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>
          <Save aria-hidden /> Registrar repasse
        </SubmitButton>
        <p className="min-w-0 flex-1 basis-56 text-[13px] text-suave">
          Faça o PIX pelo banco e registre aqui. As {vendas} venda(s) liberada(s) passam para “Paga” e o influenciador vê o repasse no Portal.
        </p>
      </div>
    </ActionForm>
  )
}

/** Regras do programa (Ajustes). */
export function FormularioRegras({
  acao,
  regras,
  podeEditar,
}: {
  acao: AcaoFormulario
  regras: { comissao_padrao: number; desconto_padrao: number; carencia_dias: number; loja_url: string | null; regras: string | null; nome_no_portal: string | null; nome_loja: string }
  podeEditar: boolean
}) {
  return (
    <ActionForm action={acao} className="space-y-4">
      <fieldset disabled={!podeEditar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Comissão padrão" name="influ_comissao_padrao" dica="Sugerida ao cadastrar. Cada influenciador pode ter a sua.">
            <CampoPercentual name="influ_comissao_padrao" defaultValue={paraCampo(regras.comissao_padrao)} />
          </Field>
          <Field label="Desconto padrão do cupom" name="influ_desconto_padrao" dica="Sugerido ao cadastrar.">
            <CampoPercentual name="influ_desconto_padrao" defaultValue={paraCampo(regras.desconto_padrao)} />
          </Field>
          <Field label="Carência (dias)" name="influ_carencia_dias" dica="Dias depois do pedido para a comissão liberar (trocas e devoluções).">
            <Input name="influ_carencia_dias" inputMode="numeric" className="tipo-dado" defaultValue={String(regras.carencia_dias)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da loja no Portal" name="influ_nome_loja" dica="Como o influenciador vê a loja. Vazio = o nome das Configurações.">
            <Input name="influ_nome_loja" maxLength={80} defaultValue={regras.nome_no_portal ?? ''} placeholder={regras.nome_loja} />
          </Field>
          <Field label="Endereço da loja" name="influ_loja_url" dica="Forma o link de divulgação: endereço/discount/CUPOM já abre a loja com o cupom aplicado.">
            <Input name="influ_loja_url" autoComplete="off" spellCheck={false} defaultValue={regras.loja_url ?? ''} placeholder="https://www.sualoja.com.br" />
          </Field>
        </div>
        <Field
          label="Como e quando pagamos"
          name="influ_regras"
          dica="Aparece no Portal do influenciador. Ex.: repasses por PIX todo dia 10, a partir de R$ 50 em comissões."
        >
          <Textarea name="influ_regras" rows={4} maxLength={4000} defaultValue={regras.regras ?? ''} />
        </Field>
      </fieldset>
      {podeEditar ? (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton variante="escuro">
            <Save aria-hidden /> Salvar regras
          </SubmitButton>
          <p className="min-w-0 flex-1 basis-56 text-[13px] text-suave">
            Mudanças valem para os próximos cadastros e pedidos. O que já foi calculado não muda.
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-suave">Só administradores alteram as regras do programa.</p>
      )}
    </ActionForm>
  )
}

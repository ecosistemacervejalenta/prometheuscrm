import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { PerfilDaLoja } from '@/features/pre-vendas/publico/abertura'
import { DIAS_APARELHO_LEMBRADO, EMPRESA, MINUTOS_CODIGO } from '@/features/privacidade/empresa'
import { formatarData, formatarWhatsapp } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/admin'
import { linkWhatsapp } from '@/lib/whatsapp'

/**
 * Política de Privacidade (LGPD) — pública, linkada de forma discreta no link da pré-venda e no
 * /pagar. TEXTO BASE de 2026-11-25 para revisão do jurídico: os dados da empresa ficam em
 * src/features/privacidade/empresa.ts (o que faltar aparece como "[a preencher]").
 */

export const metadata: Metadata = {
  title: { absolute: `Política de Privacidade · ${EMPRESA.nomeFantasia}` },
  description: `Como a ${EMPRESA.nomeFantasia} trata os seus dados pessoais, conforme a LGPD (Lei nº 13.709/2018).`,
}

// O WhatsApp da loja vem das Configurações do CRM.
export const revalidate = 3600

async function whatsappDaLoja() {
  try {
    const { data } = await createAdminClient().from('configuracoes').select('whatsapp_loja').eq('id', 1).maybeSingle()
    return data?.whatsapp_loja ?? null
  } catch {
    return null
  }
}

/** Campo ainda sem valor: aparece destacado até ser preenchido em empresa.ts. */
function Dado({ valor, campo }: { valor: string | null; campo: string }) {
  if (valor) return <>{valor}</>
  return <mark className="rounded bg-alerta-50 px-1 font-semibold text-alerta">[{campo} — a preencher]</mark>
}

function Secao({ id, numero, titulo, children }: { id: string; numero: number; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="tipo-h3 text-balance">
        <span className="tipo-dado mr-2 text-volt-700">{String(numero).padStart(2, '0')}</span>
        {titulo}
      </h2>
      <div className="mt-3 space-y-3 text-[16px] leading-7 text-ink/85 [&_li]:pl-1 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  )
}

const SECOES = [
  ['quem-somos', 'Quem cuida dos seus dados'],
  ['dados', 'Quais dados usamos'],
  ['finalidades', 'Para que usamos e com qual base legal'],
  ['grupo-vip', 'Grupo VIP e confirmação do WhatsApp'],
  ['compartilhamento', 'Com quem compartilhamos'],
  ['internacional', 'Transferência para fora do Brasil'],
  ['prazos', 'Por quanto tempo guardamos'],
  ['seguranca', 'Como protegemos'],
  ['cookies', 'Cookies e dados no seu aparelho'],
  ['direitos', 'Seus direitos e como pedir'],
  ['menores', 'Menores de 18 anos'],
  ['mudancas', 'Mudanças nesta política'],
] as const

export default async function PaginaPrivacidade() {
  const whatsapp = await whatsappDaLoja()
  const contatoWhatsapp = whatsapp ? (
    <a
      href={linkWhatsapp(whatsapp, 'Olá! Quero fazer um pedido sobre os meus dados pessoais (LGPD).')}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-volt-700 underline underline-offset-2 hover:text-ink"
    >
      {formatarWhatsapp(whatsapp)}
    </a>
  ) : (
    <Dado valor={null} campo="WhatsApp da loja" />
  )
  const contatoEmail = EMPRESA.emailPrivacidade ? (
    <a href={`mailto:${EMPRESA.emailPrivacidade}`} className="font-semibold text-volt-700 underline underline-offset-2 hover:text-ink">
      {EMPRESA.emailPrivacidade}
    </a>
  ) : (
    <Dado valor={null} campo="e-mail de privacidade" />
  )

  return (
    <div className="min-h-dvh bg-papel">
      <main className="mx-auto w-full max-w-2xl px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(40px,env(safe-area-inset-bottom))]">
        <PerfilDaLoja className="mb-5" />
        <header className="text-center">
          <p className="tipo-rotulo text-volt-700">{EMPRESA.nomeFantasia}</p>
          <h1 className="tipo-h1 mt-2 text-balance">Política de Privacidade</h1>
          <p className="mt-2 text-[15px] text-suave">Última atualização: {formatarData(EMPRESA.atualizadaEm)}</p>
        </header>

        <section className="mt-8 rounded-[24px] bg-ink p-6 text-white">
          <h2 className="tipo-h3 text-volt">Resumo</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-7 text-white/85">
            <li>Usamos seu nome, WhatsApp, e-mail e endereço para vender, cobrar, entregar e falar com você sobre o seu pedido.</li>
            <li>No link da pré-venda, seus dados só aparecem depois de um código enviado ao seu WhatsApp. Ninguém do grupo vê o que você comprou.</li>
            <li>Não vendemos seus dados. Só os passamos a quem nos ajuda a operar (pagamento, entrega, sistemas), e só o necessário.</li>
            <li>Você pode pedir para ver, corrigir ou apagar seus dados e para não receber mais mensagens, a qualquer momento.</li>
          </ul>
        </section>

        <nav aria-label="Nesta página" className="mt-6 rounded-[24px] border border-linha bg-superficie p-5">
          <p className="tipo-rotulo text-suave">Nesta página</p>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
            {SECOES.map(([id, titulo], i) => (
              <li key={id}>
                <a href={`#${id}`} className="hover:text-volt-700">
                  <span className="tipo-dado mr-1.5 text-suave">{String(i + 1).padStart(2, '0')}</span>
                  {titulo}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          <Secao id="quem-somos" numero={1} titulo="Quem cuida dos seus dados">
            <p>
              Esta política explica como a <strong>{EMPRESA.nomeFantasia}</strong> trata os dados pessoais de clientes e de quem fala com a
              gente, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD). Ela vale para o link de pré-venda, a página de
              pagamento, o atendimento pelo WhatsApp, o Grupo VIP e os pedidos feitos com a nossa equipe.
            </p>
            <p>
              A controladora dos dados é <strong><Dado valor={EMPRESA.razaoSocial} campo="Razão social" /></strong>, CNPJ{' '}
              <Dado valor={EMPRESA.cnpj} campo="CNPJ" />, com sede em <Dado valor={EMPRESA.endereco} campo="Endereço" />.
            </p>
            <p>
              Encarregado pelo tratamento de dados (DPO): <Dado valor={EMPRESA.encarregado} campo="Nome do encarregado" />. Contato:{' '}
              {contatoEmail} ou WhatsApp {contatoWhatsapp}.
            </p>
          </Secao>

          <Secao id="dados" numero={2} titulo="Quais dados usamos">
            <ul>
              <li>
                <strong>Cadastro e entrega:</strong> nome e sobrenome, WhatsApp, e-mail e endereço de entrega (CEP, rua, número, complemento,
                bairro, cidade e estado). CPF e data de nascimento só quando forem necessários, por exemplo, para a nota fiscal.
              </li>
              <li>
                <strong>Compras:</strong> cervejas escolhidas, pré-vendas de que participou, Caixa VIP, valores, frete, observações do pedido e
                situação do pagamento.
              </li>
              <li>
                <strong>Pagamento:</strong> o PIX é gerado pelo Mercado Pago. Não recebemos nem guardamos dados bancários ou de cartão; recebemos
                só a confirmação, o valor e a data do pagamento.
              </li>
              <li>
                <strong>Conversas:</strong> mensagens, fotos, áudios e arquivos trocados com o WhatsApp da loja ficam no nosso sistema de
                atendimento, para a equipe responder e lembrar do seu histórico.
              </li>
              <li>
                <strong>Segurança do link:</strong> o código de confirmação enviado ao seu WhatsApp, o registro do aparelho confirmado e o seu
                endereço IP — guardados de forma cifrada, só para evitar acesso indevido e envio de códigos em massa.
              </li>
              <li>
                <strong>Comunicações:</strong> nome e WhatsApp em listas de contatos, para avisar sobre pré-vendas e novidades, e as respostas a
                essas mensagens (inclusive quando você pede para sair).
              </li>
            </ul>
            <p>Não pedimos dados sensíveis (como saúde, religião ou biometria).</p>
          </Secao>

          <Secao id="finalidades" numero={3} titulo="Para que usamos e com qual base legal">
            <ul>
              <li>
                <strong>Registrar e entregar o seu pedido</strong> (pré-venda, Caixa VIP, cobrança, frete, entrega e atendimento) —{' '}
                <em>execução de contrato</em> (art. 7º, V, da LGPD).
              </li>
              <li>
                <strong>Emitir nota fiscal e guardar os registros de venda</strong> — <em>cumprimento de obrigação legal</em> (art. 7º, II).
              </li>
              <li>
                <strong>Confirmar que o WhatsApp é seu, evitar fraudes e proteger o seu cadastro</strong> — <em>legítimo interesse</em> e
                segurança (art. 7º, IX).
              </li>
              <li>
                <strong>Avisar sobre pré-vendas, lançamentos e novidades</strong> no Grupo VIP e por mensagens — <em>legítimo interesse</em>{' '}
                (art. 7º, IX) ou <em>consentimento</em> (art. 7º, I), conforme o caso. Você pode pedir para não receber mais a qualquer momento.
              </li>
              <li>
                <strong>Defender direitos</strong> em processos administrativos ou judiciais — <em>exercício regular de direitos</em> (art. 7º,
                VI).
              </li>
            </ul>
          </Secao>

          <Secao id="grupo-vip" numero={4} titulo="Grupo VIP e confirmação do WhatsApp">
            <p>
              No grupo do WhatsApp, os participantes podem ver o número uns dos outros — é assim que o WhatsApp funciona. Por isso, o seu
              número sozinho não abre nada: quando você digita o WhatsApp no link da pré-venda, mandamos um <strong>código de 6 números</strong>{' '}
              nesse WhatsApp. Só depois do código o link mostra o seu cadastro, a sua Caixa VIP e aceita a compra.
            </p>
            <ul>
              <li>O código vale por {MINUTOS_CODIGO} minutos e aceita poucas tentativas; depois disso, é preciso pedir outro.</li>
              <li>
                O aparelho em que você confirmou fica lembrado por {DIAS_APARELHO_LEMBRADO} dias, para você não precisar do código a cada compra.
                Em outro aparelho, pedimos o código de novo.
              </li>
              <li>Recebeu um código sem ter pedido? É só ignorar: sem ele, ninguém vê os seus dados.</li>
              <li>A página de pagamento mostra só o seu primeiro nome, o bairro e a cidade — nunca o endereço completo.</li>
            </ul>
          </Secao>

          <Secao id="compartilhamento" numero={5} titulo="Com quem compartilhamos">
            <p>
              <strong>Não vendemos nem alugamos seus dados.</strong> Compartilhamos só o necessário com empresas que nos ajudam a operar, que
              tratam os dados em nosso nome e seguindo as nossas instruções:
            </p>
            <ul>
              <li><strong>Hospedagem e banco de dados</strong> do nosso sistema (Supabase e Vercel).</li>
              <li><strong>WhatsApp</strong> (Meta) e o serviço que conecta o WhatsApp da loja ao nosso atendimento.</li>
              <li><strong>Pagamento:</strong> Mercado Pago, que recebe o seu e-mail e o valor para gerar o PIX.</li>
              <li><strong>Gestão, estoque e nota fiscal:</strong> o nosso sistema de gestão (ERP).</li>
              <li><strong>Automação</strong> de avisos e rotinas internas.</li>
              <li><strong>Entrega:</strong> transportadora ou entregador, que recebe nome, telefone e endereço.</li>
            </ul>
            <p>
              Quando você compra por outros canais (loja online ou marketplaces), recebemos desses canais os dados necessários para o pedido.
              Também podemos informar dados a autoridades quando a lei exigir.
            </p>
          </Secao>

          <Secao id="internacional" numero={6} titulo="Transferência para fora do Brasil">
            <p>
              O nosso banco de dados fica no Brasil (São Paulo). Alguns fornecedores, como os de hospedagem do site e o WhatsApp, podem
              processar dados em outros países. Nesses casos, a transferência segue o art. 33 da LGPD, com fornecedores que oferecem garantias
              adequadas de proteção.
            </p>
          </Secao>

          <Secao id="prazos" numero={7} titulo="Por quanto tempo guardamos">
            <ul>
              <li>
                <strong>Cadastro e histórico de compras:</strong> enquanto você for nosso cliente, para facilitar as próximas compras e o
                atendimento. Se pedir a exclusão, anonimizamos os seus dados.
              </li>
              <li>
                <strong>Registros de venda e fiscais:</strong> pelo prazo exigido pela legislação (em geral, 5 anos), mesmo após um pedido de
                exclusão — nesse caso, sem o seu nome, contato e endereço.
              </li>
              <li><strong>Código de confirmação:</strong> apagado em até 1 dia.</li>
              <li><strong>Aparelho confirmado:</strong> {DIAS_APARELHO_LEMBRADO} dias, ou até você tocar em “Não sou eu”.</li>
              <li><strong>Conversas no WhatsApp:</strong> enquanto forem úteis para o atendimento, ou até você pedir a exclusão.</li>
              <li>
                <strong>Pedido para não receber mensagens:</strong> guardamos só o número numa lista de bloqueio, para respeitar o seu pedido.
              </li>
            </ul>
          </Secao>

          <Secao id="seguranca" numero={8} titulo="Como protegemos">
            <ul>
              <li>Conexão segura (HTTPS) em todas as páginas.</li>
              <li>Acesso ao sistema só para a nossa equipe, com login individual e permissões por função.</li>
              <li>Código no WhatsApp para ver ou alterar dados pelo link; limites de tentativas e de pedidos de código.</li>
              <li>Códigos e identificadores de aparelho guardados de forma cifrada; páginas públicas mostram o mínimo de dados.</li>
            </ul>
            <p>
              Se acontecer um incidente de segurança que possa trazer risco a você, avisaremos você e a Autoridade Nacional de Proteção de
              Dados (ANPD), como manda a lei.
            </p>
          </Secao>

          <Secao id="cookies" numero={9} titulo="Cookies e dados no seu aparelho">
            <ul>
              <li>
                <strong>Cookie essencial do aparelho confirmado:</strong> lembra, por {DIAS_APARELHO_LEMBRADO} dias, que você confirmou o seu
                WhatsApp neste aparelho. Sem ele, o código seria pedido a cada compra.
              </li>
              <li>
                <strong>Dados no navegador:</strong> o link guarda no seu próprio aparelho os dados digitados e o último pedido, para preencher a
                próxima compra. Tocar em “Não sou eu” apaga.
              </li>
            </ul>
            <p>Não usamos cookies de publicidade nem ferramentas de rastreamento de terceiros nessas páginas.</p>
          </Secao>

          <Secao id="direitos" numero={10} titulo="Seus direitos e como pedir">
            <p>Pela LGPD (art. 18), você pode, a qualquer momento e sem custo:</p>
            <ul>
              <li>confirmar se tratamos seus dados e ter acesso a eles;</li>
              <li>corrigir dados incompletos, errados ou desatualizados;</li>
              <li>pedir a anonimização, o bloqueio ou a exclusão de dados desnecessários ou tratados em desacordo com a lei;</li>
              <li>pedir a portabilidade dos dados a outro fornecedor;</li>
              <li>pedir a exclusão dos dados tratados com o seu consentimento e revogar esse consentimento;</li>
              <li>saber com quem compartilhamos os seus dados;</li>
              <li>se opor a um tratamento, como o envio de novidades e pré-vendas.</li>
            </ul>
            <p>
              Para pedir, fale com a gente pelo WhatsApp {contatoWhatsapp} ou pelo e-mail {contatoEmail}. Para proteger você, confirmamos que o
              pedido vem do seu próprio WhatsApp antes de atender. Respondemos em até 15 dias.
            </p>
            <p>
              Para deixar de receber mensagens de pré-venda e novidades, também basta tocar no botão de sair da mensagem ou responder dizendo
              que não quer mais receber.
            </p>
            <p>
              Se achar que não resolvemos, você pode reclamar na ANPD em{' '}
              <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="font-semibold text-volt-700 underline underline-offset-2 hover:text-ink">
                gov.br/anpd
              </a>
              .
            </p>
          </Secao>

          <Secao id="menores" numero={11} titulo="Menores de 18 anos">
            <p>
              Vendemos bebidas alcoólicas, que são proibidas para menores de 18 anos (Estatuto da Criança e do Adolescente, arts. 81 e 243).
              Nossos canais de venda não são destinados a menores e não coletamos dados deles de propósito. Se soubermos que um cadastro é de
              um menor, ele será excluído.
            </p>
          </Secao>

          <Secao id="mudancas" numero={12} titulo="Mudanças nesta política">
            <p>
              Podemos atualizar esta política quando mudarmos a forma de tratar dados ou quando a lei exigir. A data da última atualização fica
              no topo da página. Mudanças importantes serão avisadas pelos nossos canais.
            </p>
          </Secao>
        </div>

        <p className="mt-12 border-t border-linha pt-6 text-center text-[13px] text-suave">
          {EMPRESA.nomeFantasia} · <Dado valor={EMPRESA.razaoSocial} campo="Razão social" /> · CNPJ <Dado valor={EMPRESA.cnpj} campo="CNPJ" />
        </p>
      </main>
    </div>
  )
}

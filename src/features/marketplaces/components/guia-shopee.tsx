import { Alert } from '@/components/ui/alert'

import type { StatusMarketplace } from '../canais'
import { CampoCopiavel, Codigo, Lista, Respostas, TextoPronto } from './blocos-guia'
import { GuiaPassos, type Passo } from './guia-passos'

// Textos em inglês (o formulário da Shopee é em inglês), com a tradução logo abaixo de cada um.
const PROPOSITO = `We are a registered Brazilian business selling on Shopee. We are connecting our own in-house system (our internal CRM) to read our own shop's orders, payment/escrow details and fees, in order to calculate the real profit of each sale and reconcile our finances. The system is used only by our team, for our own shop, and will not be offered to other sellers.`
const PROPOSITO_PT =
  'Tradução: somos uma empresa brasileira que vende na Shopee. Estamos ligando nosso sistema interno (CRM próprio) para ler os pedidos, repasses e taxas da nossa loja e calcular o lucro real de cada venda. Usado só pela nossa equipe, para a nossa loja.'

const DESCRICAO_APP = `Internal CRM of our shop. Reads our own orders, escrow/payment details and fees to calculate the real profit of each sale. Read-only. Used only by our team for our own Shopee shop.`
const DESCRICAO_APP_PT =
  'Tradução: CRM interno da loja. Lê pedidos, repasses e taxas da nossa loja para calcular o lucro real de cada venda. Só leitura, usado só pela nossa equipe.'

const INTRODUCAO = `Prometheus CRM is the internal management system of our shop (a registered Brazilian seller). It reads our own Shopee orders and escrow details (commission, service and transaction fees, shipping and the final amount released) and shows, for each sale and month, how much we actually keep. It is read-only: it does not change listings, prices or orders. Only our own team logs in; it is not offered to other sellers.`
const INTRODUCAO_PT =
  'Tradução: o Prometheus CRM é o sistema interno da loja. Lê nossos pedidos e repasses da Shopee (comissão, taxas, frete e valor liberado) e mostra quanto realmente sobra de cada venda e mês. Só leitura; só nossa equipe acessa.'

const IPS_INDISPONIVEIS = `Our system runs on serverless cloud providers (Vercel for the application, region São Paulo, and Supabase for the database), which use dynamic IP addresses. We do not have static IPs to declare. We do not request buyer sensitive data.`
const IPS_INDISPONIVEIS_PT =
  'Tradução: o sistema roda em nuvem sem servidor fixo (Vercel e Supabase), com IPs que mudam. Não temos IP fixo para declarar e não pedimos dados sensíveis do comprador.'

/** Passo a passo da Shopee Open Platform: login, perfil de vendedor, app In-House, Go Live e autorização. */
export function GuiaShopee({ status, site }: { status: StatusMarketplace; site: string }) {
  const dominio = new URL(site).origin

  const passos: Passo[] = [
    {
      chave: 'requisitos',
      titulo: 'Antes de começar: o que a Shopee exige',
      resumo: 'Loja em nome da empresa (CNPJ), com pelo menos 1 pedido nos últimos 30 dias.',
      conteudo: (
        <div className="space-y-3">
          <Lista>
            <li>
              A loja da Shopee precisa estar cadastrada como <strong>empresa (CNPJ)</strong> — no Brasil a Shopee não libera a API
              para vendedor pessoa física.
            </li>
            <li>
              Ter <strong>pelo menos 1 pedido nos últimos 30 dias</strong>.
            </li>
            <li>
              Deixar à mão o <strong>Cartão CNPJ em PDF</strong> (tire em servicos.receita.fazenda.gov.br) e, se tiver, o contrato
              social — a Shopee pode pedir para comprovar a empresa.
            </li>
            <li>
              Escolher o <strong>e-mail do login</strong> da Open Platform: ele <strong>não pode ser trocado depois</strong>. Use um
              e-mail da empresa que vocês sempre vão ter acesso.
            </li>
          </Lista>
          <Alert tom="info" titulo="Quanto tempo leva">
            Login: 5 minutos. Análise do perfil: até 3 dias úteis. Criação do app: 5 minutos. Análise do Go Live: cerca de 24 horas
            (às vezes mais). Depois disso, a conexão no CRM leva 2 minutos.
          </Alert>
        </div>
      ),
    },
    {
      chave: 'login',
      titulo: 'Criar o login na Shopee Open Platform',
      resumo: 'O portal de desenvolvedores da Shopee — é separado da Central do Vendedor.',
      links: [{ href: 'https://open.shopee.com/', rotulo: 'Abrir a Open Platform' }],
      conteudo: (
        <Lista>
          <li>
            Em <strong>open.shopee.com</strong>, clique em <strong>Log In › Sign up</strong> e informe o e-mail escolhido.
          </li>
          <li>Pegue o código que chega no e-mail (olhe o spam), digite e crie a senha.</li>
          <li>
            Use uma senha <strong>diferente</strong> da Central do Vendedor. Se o console tiver a opção de idioma, mude para
            Português.
          </li>
        </Lista>
      ),
    },
    {
      chave: 'perfil',
      titulo: 'Pedir o perfil de desenvolvedor (o formulário)',
      resumo: 'Você informa que é vendedor e que o sistema é só para a própria loja. Análise em até 3 dias úteis.',
      links: [{ href: 'https://open.shopee.com/console/app', rotulo: 'Abrir o Console' }],
      conteudo: (
        <div className="space-y-3">
          <p>
            No <strong>Console › App Management › App List</strong>, a Shopee pede para escolher o tipo de conta. Responda assim:
          </p>
          <Respostas
            itens={[
              {
                campo: 'Account type (tipo de conta)',
                resposta: (
                  <>
                    <strong className="text-ink">Shopee Seller</strong>. Não escolha “Third-party Partner Platform (ISV)” — esse é
                    para empresas que vendem software para outros lojistas e tem análise bem mais exigente.
                  </>
                ),
              },
              {
                campo: 'Verificação da loja',
                resposta: 'A Shopee abre o login da loja: entre com o e-mail/telefone e a senha da conta principal da loja.',
              },
              {
                campo: 'Seller Type',
                resposta: (
                  <>
                    <strong className="text-ink">Registered Business Seller</strong> (empresa com CNPJ). “Individual Seller” não é
                    aceito no Brasil.
                  </>
                ),
              },
              {
                campo: "Key Account Manager's Email",
                resposta:
                  'Deixe em branco. Só preencha se a loja tiver um gerente de contas na Shopee (e-mail terminado em @shopee.com).',
              },
              {
                campo: 'Dados da empresa (razão social, CNPJ, endereço, contato)',
                resposta: 'Exatamente como estão no Cartão CNPJ. Nome e telefone de contato: o responsável pela loja.',
              },
              {
                campo: 'Documento da empresa (Business License / Registration)',
                resposta: 'O Cartão CNPJ em PDF. Se pedir outro documento, o contrato social.',
              },
            ]}
          />
          <TextoPronto
            rotulo="Se pedir o objetivo / descrição do uso (Purpose / Description)"
            texto={PROPOSITO}
            dica={PROPOSITO_PT}
          />
          <p>
            Clique em <strong>Submit</strong>. A resposta chega por e-mail em até 3 dias úteis. Se for recusado, o motivo aparece no
            e-mail e em <strong>App List › Go to Profile</strong>; clique em <strong>Edit</strong>, corrija e envie de novo.
          </p>
        </div>
      ),
    },
    {
      chave: 'app',
      titulo: 'Criar o app (tipo Seller In-House System)',
      resumo: 'Depois do perfil aprovado. O tipo do app não pode ser trocado depois.',
      links: [
        { href: 'https://open.shopee.com/console/app', rotulo: 'Abrir App List' },
        { href: `${site}/brand/logo-cor.png`, rotulo: 'Baixar logotipo' },
      ],
      conteudo: (
        <div className="space-y-3">
          <p>
            No Console, clique em <strong>Create App</strong> e preencha:
          </p>
          <Respostas
            itens={[
              {
                campo: 'App Type (categoria)',
                resposta: (
                  <>
                    <strong className="text-ink">Seller In-house System</strong> — o tipo para o vendedor que tem o próprio sistema. Dá
                    acesso a todas as APIs da própria loja, inclusive pedidos e repasses.
                  </>
                ),
              },
              { campo: 'App Logo', resposta: 'O logotipo da loja (botão “Baixar logotipo” abaixo).' },
            ]}
          />
          <TextoPronto rotulo="App Name" texto="Prometheus CRM" />
          <TextoPronto rotulo="App Description" texto={DESCRICAO_APP} dica={DESCRICAO_APP_PT} />
          <CampoCopiavel rotulo="Test Redirect URL Domain e Live Redirect URL Domain (os dois iguais)" valor={dominio} />
          <p className="text-[13px] text-suave">
            Ao criar, aparecem um <strong>Test Partner ID</strong> e uma <strong>Test Key</strong>: são só do ambiente de testes
            (Sandbox). Não use no CRM — o app fica como <Codigo>Developing</Codigo> até o Go Live do próximo passo.
          </p>
        </div>
      ),
    },
    {
      chave: 'go-live',
      titulo: 'Pedir a publicação do app (Go Live)',
      resumo: 'A Shopee revisa em cerca de 24 h e libera o Live Partner ID e a Live Key.',
      links: [{ href: 'https://open.shopee.com/console/app', rotulo: 'Abrir App List' }],
      conteudo: (
        <div className="space-y-3">
          <p>
            Em <strong>App List</strong>, selecione o app e clique em <strong>Go Live</strong>. Responda assim:
          </p>
          <CampoCopiavel rotulo="Live version of your business product's URL" valor={dominio} />
          <TextoPronto rotulo="Brief Introduction" texto={INTRODUCAO} dica={INTRODUCAO_PT} />
          <Respostas
            itens={[
              {
                campo: 'Test Username / Test Password',
                resposta: (
                  <>
                    Se não for obrigatório, deixe em branco (sistema interno). Se for, crie um login temporário em{' '}
                    <strong className="text-ink">Configurações › Equipe</strong> com papel <strong className="text-ink">Equipe</strong>{' '}
                    (não Admin), informe aqui e <strong className="text-ink">bloqueie o login</strong> (botão Bloquear) depois da aprovação.
                  </>
                ),
              },
              {
                campo: 'Your client user interface screenshot',
                resposta: 'Um print desta tela (Configurações › Marketplaces) ou da Visão geral do CRM.',
              },
              { campo: 'Test / Live Redirect URL Domain', resposta: <>O mesmo domínio do passo anterior: {dominio}</> },
              {
                campo: 'IP Address Whitelist',
                resposta: (
                  <>
                    <strong className="text-ink">Não habilite.</strong> O CRM roda na Vercel, sem IP fixo; com a lista ligada, as
                    chamadas seriam bloqueadas. A lista só é exigida para dados sensíveis do comprador (nome, endereço), que o CRM não
                    usa.
                  </>
                ),
              },
              {
                campo: 'Other IT Assets Declaration (Database Servers / Other Servers)',
                resposta: (
                  <>
                    Escolha <strong className="text-ink">IP address(es) unavailable</strong> e cole o motivo abaixo.
                  </>
                ),
              },
            ]}
          />
          <TextoPronto rotulo="Motivo (IP address(es) unavailable)" texto={IPS_INDISPONIVEIS} dica={IPS_INDISPONIVEIS_PT} />
          <p>
            Clique em <strong>Submit</strong>. Quando aprovado, o app fica <Codigo>Online</Codigo> e o{' '}
            <strong>Live Partner ID</strong> e a <strong>Live Key</strong> aparecem em <strong>App Key</strong>, nos detalhes do app.
          </p>
        </div>
      ),
    },
    {
      chave: 'chaves',
      titulo: 'Live Partner ID e Live Key → salvar no CRM',
      resumo: 'Os códigos de produção do app. A Live Key fica criptografada.',
      confirmado: status.configurado,
      dicaConfirmacao: 'Fica verde quando os dados forem salvos no quadro da Shopee, acima.',
      links: [{ href: 'https://open.shopee.com/console/app', rotulo: 'Abrir App List' }],
      conteudo: (
        <Lista>
          <li>
            Em <strong>App List</strong>, abra o app e vá em <strong>App Key</strong>.
          </li>
          <li>
            Copie o <strong>Live Partner ID</strong> (só números) → campo <strong>Live Partner ID</strong> no quadro da Shopee, acima.
          </li>
          <li>
            Copie a <strong>Live Key</strong> → campo <strong>Live Partner Key</strong>. Atenção: use os de <strong>Live</strong>,
            não os de Test.
          </li>
          <li>
            Clique em <strong>Salvar dados do app</strong>. Não mande a Live Key por WhatsApp nem e-mail: cole direto aqui.
          </li>
        </Lista>
      ),
    },
    {
      chave: 'autorizar',
      titulo: 'Autorizar a loja',
      resumo: 'Um clique em “Conectar Shopee” e a confirmação na tela da Shopee, por 365 dias.',
      confirmado: status.conectado,
      dicaConfirmacao: status.conectado
        ? `Conectado à loja ${status.conta_nome ?? status.conta_id ?? ''}.`
        : 'Fica verde quando a loja for autorizada.',
      conteudo: (
        <div className="space-y-3">
          <Lista>
            <li>
              No quadro da Shopee, acima, clique em <strong>Conectar Shopee</strong>.
            </li>
            <li>Entre com a conta principal da loja e digite o código que chega no celular.</li>
            <li>
              Clique em <strong>Confirm Authorization</strong> e, na validade, escolha <strong>365 days</strong> (o máximo).
            </li>
            <li>O CRM volta para esta tela com a loja conectada. O acesso é renovado sozinho, todo dia.</li>
          </Lista>
          <p className="text-[13px] text-suave">
            A autorização vale no máximo 365 dias: o quadro mostra até quando e avisa 30 dias antes para clicar em Reconectar. Erro
            “The domain of redirect_uri is not consistent”: o domínio cadastrado no app tem que ser exatamente {dominio}.
          </p>
        </div>
      ),
    },
  ]

  return (
    <GuiaPassos
      id="shopee"
      titulo="Passo a passo · Shopee"
      descricao="Siga na ordem. Tem duas análises da Shopee no meio (perfil e Go Live) — vale começar já."
      passos={passos}
    />
  )
}

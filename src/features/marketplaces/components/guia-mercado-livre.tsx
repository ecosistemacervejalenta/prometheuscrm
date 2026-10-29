import { Alert } from '@/components/ui/alert'

import { caminhoCallback, type StatusMarketplace } from '../canais'
import { CampoCopiavel, Codigo, Lista, Respostas, TextoPronto } from './blocos-guia'
import { GuiaPassos, type Passo } from './guia-passos'

const DESCRICAO_APP =
  'Sistema interno da nossa loja: lê vendas, tarifas e envios da nossa conta para calcular o resultado de cada venda. Não altera anúncios.'

/** Passo a passo para criar o app no DevCenter do Mercado Livre e conectar a conta. */
export function GuiaMercadoLivre({ status, site }: { status: StatusMarketplace; site: string }) {
  const urlRetorno = `${site}${caminhoCallback('mercado_livre')}`
  const urlNotificacoes = `${site}/api/webhooks/mercado-livre`

  const passos: Passo[] = [
    {
      chave: 'conta',
      titulo: 'Conta principal com os dados validados',
      resumo: 'O app é criado com a conta que vende — não com um colaborador.',
      links: [{ href: 'https://myaccount.mercadolivre.com.br/profile', rotulo: 'Abrir Meu perfil' }],
      conteudo: (
        <div className="space-y-3">
          <Lista>
            <li>
              Use o login <strong>principal</strong> da conta vendedora (o dono da conta). Usuários colaboradores/operadores não
              conseguem criar o app nem autorizar.
            </li>
            <li>
              Em <strong>Meu perfil › Dados pessoais</strong> (ou dados da empresa), confira se nome/razão social, CPF ou CNPJ,
              endereço e telefone estão completos e validados.
            </li>
          </Lista>
          <Alert tom="alerta" titulo="No Brasil, cada conta cria só 1 aplicação">
            E só depois que os dados do titular estiverem validados. Se o DevCenter não deixar criar, fale com o atendimento do
            Mercado Livre para validar os dados da conta.
          </Alert>
        </div>
      ),
    },
    {
      chave: 'app',
      titulo: 'Criar o aplicativo no DevCenter',
      resumo: 'É por ele que o CRM lê as vendas e as tarifas. Copie e cole cada campo abaixo.',
      links: [
        { href: 'https://developers.mercadolivre.com.br/devcenter', rotulo: 'Abrir o DevCenter' },
        { href: `${site}/brand/logo-cor.png`, rotulo: 'Baixar logotipo' },
      ],
      conteudo: (
        <div className="space-y-3">
          <p>
            Entre em <strong>developers.mercadolivre.com.br</strong> com a conta principal, aceite os termos se aparecerem e clique em{' '}
            <strong>Criar uma aplicação</strong>. Preencha assim:
          </p>
          <TextoPronto
            rotulo="Nome"
            texto="Prometheus CRM"
            dica="Tem que ser único no Mercado Livre. Se recusar, acrescente o nome da loja (ex.: Prometheus CRM Cerveja Lenta)."
          />
          <TextoPronto rotulo="Nome curto" texto="prometheuscrm" dica="Se já existir, acrescente o nome da loja, sem espaços." />
          <TextoPronto rotulo="Descrição (até 150 caracteres)" texto={DESCRICAO_APP} dica="Aparece para quem autoriza o app." />
          <CampoCopiavel rotulo="URIs de redirect (copie exatamente)" valor={urlRetorno} />
          {!urlRetorno.startsWith('https://') && (
            <Alert tom="alerta" titulo="Abra esta tela pelo endereço do CRM na internet">
              O Mercado Livre só aceita endereço com https. Entre no CRM pelo site publicado e copie a URL de lá.
            </Alert>
          )}
          <Respostas
            itens={[
              { campo: 'Logo', resposta: <>O logotipo da loja (botão “Baixar logotipo” abaixo).</> },
              { campo: 'PKCE', resposta: <><strong className="text-ink">Sim</strong> (ativado) — o CRM já usa essa proteção.</> },
              { campo: 'Device Grant', resposta: 'Deixe desligado.' },
              {
                campo: 'Escopos / permissões',
                resposta: (
                  <>
                    <strong className="text-ink">Leitura</strong> basta (o CRM não altera nada). Se a tela pedir por área, dê leitura em
                    usuários, vendas/pedidos, envios, faturamento e métricas. Se aparecer <Codigo>offline_access</Codigo> (acesso
                    offline), marque: é o que deixa o CRM renovar o acesso sozinho.
                  </>
                ),
              },
              { campo: 'Tópicos', resposta: <>Marque só <strong className="text-ink">Orders</strong> (pedidos).</> },
            ]}
          />
          <CampoCopiavel rotulo="URL de retorno de notificações" valor={urlNotificacoes} />
          <p>
            Clique em <strong>Salvar</strong>. O Mercado Livre volta para a lista <strong>Minhas aplicações</strong> com o app criado.
          </p>
        </div>
      ),
    },
    {
      chave: 'chaves',
      titulo: 'Client ID e Secret Key → salvar no CRM',
      resumo: 'Os dois códigos do app. A Secret Key fica criptografada.',
      confirmado: status.configurado,
      dicaConfirmacao: 'Fica verde quando os dados forem salvos no quadro do Mercado Livre, acima.',
      links: [{ href: 'https://developers.mercadolivre.com.br/devcenter', rotulo: 'Abrir Minhas aplicações' }],
      conteudo: (
        <Lista>
          <li>
            Em <strong>Minhas aplicações</strong>, abra o app (ou <strong>Editar</strong>).
          </li>
          <li>
            Copie o <strong>Client ID</strong> (é o ID do app, só números) → campo <strong>Client ID</strong> no quadro acima.
          </li>
          <li>
            Clique em <strong>Mostrar</strong> no <strong>Client Secret</strong> e copie → campo <strong>Client Secret</strong>.
          </li>
          <li>
            Clique em <strong>Salvar dados do app</strong>. Não mande a Secret Key por WhatsApp nem e-mail: cole direto aqui.
          </li>
        </Lista>
      ),
    },
    {
      chave: 'conectar',
      titulo: 'Autorizar a conta',
      resumo: 'Um clique em “Conectar Mercado Livre” e a permissão na tela do Mercado Livre.',
      confirmado: status.conectado,
      dicaConfirmacao: status.conectado
        ? `Conectado à conta ${status.conta_nome ?? status.conta_id ?? ''}.`
        : 'Fica verde quando a conta for autorizada.',
      conteudo: (
        <div className="space-y-3">
          <Lista>
            <li>
              No quadro do Mercado Livre, acima, clique em <strong>Conectar Mercado Livre</strong>.
            </li>
            <li>
              Entre com a <strong>conta principal</strong> da loja e clique em <strong>Permitir</strong>.
            </li>
            <li>O CRM volta para esta tela mostrando a conta conectada. Depois disso o acesso é renovado sozinho, todo dia.</li>
          </Lista>
          <p className="text-[13px] text-suave">
            Apareceu “Sorry, the application cannot connect to your account”? Confira se a URI de redirect do app é exatamente a do
            passo 2, se entrou com a conta principal (não colaborador) e se os dados da conta estão validados. Trocar a senha da
            conta ou renovar o Client Secret derruba a conexão: salve a chave nova e clique em Reconectar.
          </p>
        </div>
      ),
    },
    {
      chave: 'notificacoes',
      titulo: 'Primeiro aviso de venda',
      resumo: 'Confirma que o Mercado Livre está avisando o CRM a cada pedido.',
      confirmado: Boolean(status.notificacao_recebida_em),
      dicaConfirmacao: 'Fica verde sozinho na próxima venda (é preciso ter marcado o tópico Orders no passo 2).',
      conteudo: (
        <p>
          Nada a fazer: quando entrar a próxima venda, o Mercado Livre manda um aviso para a URL de notificações do passo 2 e este
          passo fica verde.
        </p>
      ),
    },
  ]

  return (
    <GuiaPassos
      id="mercado-livre"
      titulo="Passo a passo · Mercado Livre"
      descricao="Siga na ordem. Leva uns 15 minutos e não tem análise — dá para conectar no mesmo dia."
      passos={passos}
    />
  )
}

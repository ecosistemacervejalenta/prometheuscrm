// =============================================================================
// Tipos do banco de dados (gerado a partir das migrations).
// Para regenerar a partir do seu projeto Supabase:
//   npm run db:types
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      atividades: {
        Row: {
          id: string
          cliente_id: string | null
          pedido_id: string | null
          tipo: string
          descricao: string
          dados: Json
          autor_id: string | null
          criado_em: string
        }
        Insert: {
          id?: string
          cliente_id?: string | null
          pedido_id?: string | null
          tipo: string
          descricao: string
          dados?: Json
          autor_id?: string | null
          criado_em?: string
        }
        Update: {
          id?: string
          cliente_id?: string | null
          pedido_id?: string | null
          tipo?: string
          descricao?: string
          dados?: Json
          autor_id?: string | null
          criado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          id: string
          natureza: Database["public"]["Enums"]["natureza_financeira"]
          nome: string
          criado_em: string
        }
        Insert: {
          id?: string
          natureza: Database["public"]["Enums"]["natureza_financeira"]
          nome: string
          criado_em?: string
        }
        Update: {
          id?: string
          natureza?: Database["public"]["Enums"]["natureza_financeira"]
          nome?: string
          criado_em?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          id: string
          nome: string
          whatsapp: string | null
          email: string | null
          cpf: string | null
          data_nascimento: string | null
          cep: string | null
          logradouro: string | null
          numero: string | null
          complemento: string | null
          bairro: string | null
          cidade: string | null
          uf: string | null
          referencia: string | null
          vip: boolean
          tags: string[]
          origem: Database["public"]["Enums"]["origem_cliente"]
          observacoes: string | null
          shopify_customer_id: string | null
          app_usuario_id: string | null
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          nome: string
          whatsapp?: string | null
          email?: string | null
          cpf?: string | null
          data_nascimento?: string | null
          cep?: string | null
          logradouro?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          cidade?: string | null
          uf?: string | null
          referencia?: string | null
          vip?: boolean
          tags?: string[]
          origem?: Database["public"]["Enums"]["origem_cliente"]
          observacoes?: string | null
          shopify_customer_id?: string | null
          app_usuario_id?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          whatsapp?: string | null
          email?: string | null
          cpf?: string | null
          data_nascimento?: string | null
          cep?: string | null
          logradouro?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          cidade?: string | null
          uf?: string | null
          referencia?: string | null
          vip?: boolean
          tags?: string[]
          origem?: Database["public"]["Enums"]["origem_cliente"]
          observacoes?: string | null
          shopify_customer_id?: string | null
          app_usuario_id?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          id: number
          nome_loja: string
          whatsapp_loja: string | null
          chave_pix: string | null
          nome_recebedor_pix: string | null
          mensagem_pre_venda: string
          mensagem_cobranca: string
          atualizado_em: string
        }
        Insert: {
          id?: number
          nome_loja?: string
          whatsapp_loja?: string | null
          chave_pix?: string | null
          nome_recebedor_pix?: string | null
          mensagem_pre_venda?: string
          mensagem_cobranca?: string
          atualizado_em?: string
        }
        Update: {
          id?: number
          nome_loja?: string
          whatsapp_loja?: string | null
          chave_pix?: string | null
          nome_recebedor_pix?: string | null
          mensagem_pre_venda?: string
          mensagem_cobranca?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      contas_fixas: {
        Row: {
          id: string
          descricao: string
          categoria: string
          fornecedor_id: string | null
          valor: number
          dia_vencimento: number
          inicio_em: string
          fim_em: string | null
          ativa: boolean
          observacoes: string | null
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          descricao: string
          categoria?: string
          fornecedor_id?: string | null
          valor: number
          dia_vencimento: number
          inicio_em?: string
          fim_em?: string | null
          ativa?: boolean
          observacoes?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          descricao?: string
          categoria?: string
          fornecedor_id?: string | null
          valor?: number
          dia_vencimento?: number
          inicio_em?: string
          fim_em?: string | null
          ativa?: boolean
          observacoes?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_fixas_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar: {
        Row: {
          id: string
          descricao: string
          categoria: string
          tipo: Database["public"]["Enums"]["tipo_conta"]
          fornecedor_id: string | null
          conta_fixa_id: string | null
          competencia: string
          vencimento: string
          valor: number
          status: Database["public"]["Enums"]["status_conta"]
          pago_em: string | null
          valor_pago: number | null
          forma_pagamento: string | null
          observacoes: string | null
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          descricao: string
          categoria?: string
          tipo?: Database["public"]["Enums"]["tipo_conta"]
          fornecedor_id?: string | null
          conta_fixa_id?: string | null
          competencia: string
          vencimento: string
          valor: number
          status?: Database["public"]["Enums"]["status_conta"]
          pago_em?: string | null
          valor_pago?: number | null
          forma_pagamento?: string | null
          observacoes?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          descricao?: string
          categoria?: string
          tipo?: Database["public"]["Enums"]["tipo_conta"]
          fornecedor_id?: string | null
          conta_fixa_id?: string | null
          competencia?: string
          vencimento?: string
          valor?: number
          status?: Database["public"]["Enums"]["status_conta"]
          pago_em?: string | null
          valor_pago?: number | null
          forma_pagamento?: string | null
          observacoes?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_conta_fixa_id_fkey"
            columns: ["conta_fixa_id"]
            isOneToOne: false
            referencedRelation: "contas_fixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_receber: {
        Row: {
          id: string
          descricao: string
          categoria: string
          pagador: string | null
          competencia: string
          vencimento: string
          valor: number
          status: Database["public"]["Enums"]["status_recebimento"]
          recebido_em: string | null
          valor_recebido: number | null
          forma_pagamento: string | null
          observacoes: string | null
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          descricao: string
          categoria?: string
          pagador?: string | null
          competencia: string
          vencimento: string
          valor: number
          status?: Database["public"]["Enums"]["status_recebimento"]
          recebido_em?: string | null
          valor_recebido?: number | null
          forma_pagamento?: string | null
          observacoes?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          descricao?: string
          categoria?: string
          pagador?: string | null
          competencia?: string
          vencimento?: string
          valor?: number
          status?: Database["public"]["Enums"]["status_recebimento"]
          recebido_em?: string | null
          valor_recebido?: number | null
          forma_pagamento?: string | null
          observacoes?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      eventos_integracao: {
        Row: {
          id: string
          tipo: string
          entidade: string | null
          entidade_id: string | null
          payload: Json
          status: Database["public"]["Enums"]["status_evento"]
          tentativas: number
          ultimo_erro: string | null
          proxima_tentativa_em: string
          criado_em: string
          processado_em: string | null
        }
        Insert: {
          id?: string
          tipo: string
          entidade?: string | null
          entidade_id?: string | null
          payload?: Json
          status?: Database["public"]["Enums"]["status_evento"]
          tentativas?: number
          ultimo_erro?: string | null
          proxima_tentativa_em?: string
          criado_em?: string
          processado_em?: string | null
        }
        Update: {
          id?: string
          tipo?: string
          entidade?: string | null
          entidade_id?: string | null
          payload?: Json
          status?: Database["public"]["Enums"]["status_evento"]
          tentativas?: number
          ultimo_erro?: string | null
          proxima_tentativa_em?: string
          criado_em?: string
          processado_em?: string | null
        }
        Relationships: []
      }
      fornecedor_vendedores: {
        Row: {
          fornecedor_id: string
          vendedor_id: string
          criado_em: string
        }
        Insert: {
          fornecedor_id: string
          vendedor_id: string
          criado_em?: string
        }
        Update: {
          fornecedor_id?: string
          vendedor_id?: string
          criado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedor_vendedores_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedor_vendedores_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          id: string
          nome: string
          razao_social: string | null
          cnpj: string | null
          telefone: string | null
          email: string | null
          site: string | null
          cidade: string | null
          uf: string | null
          observacoes: string | null
          ativo: boolean
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          nome: string
          razao_social?: string | null
          cnpj?: string | null
          telefone?: string | null
          email?: string | null
          site?: string | null
          cidade?: string | null
          uf?: string | null
          observacoes?: string | null
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          razao_social?: string | null
          cnpj?: string | null
          telefone?: string | null
          email?: string | null
          site?: string | null
          cidade?: string | null
          uf?: string | null
          observacoes?: string | null
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      integracao_olist: {
        Row: {
          id: number
          access_token: string | null
          refresh_token: string | null
          access_expira_em: string | null
          refresh_expira_em: string | null
          conectado_em: string | null
          conectado_por: string | null
          ultima_sincronizacao: string | null
          sincronizado_ate: string | null
          sincronizando_desde: string | null
          ultimo_erro: string | null
          atualizado_em: string
        }
        Insert: {
          id?: number
          access_token?: string | null
          refresh_token?: string | null
          access_expira_em?: string | null
          refresh_expira_em?: string | null
          conectado_em?: string | null
          conectado_por?: string | null
          ultima_sincronizacao?: string | null
          sincronizado_ate?: string | null
          sincronizando_desde?: string | null
          ultimo_erro?: string | null
          atualizado_em?: string
        }
        Update: {
          id?: number
          access_token?: string | null
          refresh_token?: string | null
          access_expira_em?: string | null
          refresh_expira_em?: string | null
          conectado_em?: string | null
          conectado_por?: string | null
          ultima_sincronizacao?: string | null
          sincronizado_ate?: string | null
          sincronizando_desde?: string | null
          ultimo_erro?: string | null
          atualizado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_olist_conectado_por_fkey"
            columns: ["conectado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          id: string
          pedido_id: string
          produto_id: string | null
          descricao: string
          preco_unitario: number
          quantidade: number
          total: number
        }
        Insert: {
          id?: string
          pedido_id: string
          produto_id?: string | null
          descricao: string
          preco_unitario: number
          quantidade: number
          total?: never
        }
        Update: {
          id?: string
          pedido_id?: string
          produto_id?: string | null
          descricao?: string
          preco_unitario?: number
          quantidade?: number
          total?: never
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          id: string
          numero: number
          cliente_id: string
          pre_venda_id: string | null
          canal: Database["public"]["Enums"]["canal_venda"]
          origem: Database["public"]["Enums"]["origem_pedido"]
          status: Database["public"]["Enums"]["status_pedido"]
          status_pagamento: Database["public"]["Enums"]["status_pagamento"]
          subtotal: number
          taxa_entrega: number
          desconto: number
          total: number
          endereco_entrega: Json | null
          observacoes: string | null
          cobrancas_enviadas: number
          ultima_cobranca_em: string | null
          pago_em: string | null
          forma_pagamento: string | null
          shopify_order_id: string | null
          criado_por: string | null
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          numero?: never
          cliente_id: string
          pre_venda_id?: string | null
          canal?: Database["public"]["Enums"]["canal_venda"]
          origem?: Database["public"]["Enums"]["origem_pedido"]
          status?: Database["public"]["Enums"]["status_pedido"]
          status_pagamento?: Database["public"]["Enums"]["status_pagamento"]
          subtotal?: number
          taxa_entrega?: number
          desconto?: number
          total?: never
          endereco_entrega?: Json | null
          observacoes?: string | null
          cobrancas_enviadas?: number
          ultima_cobranca_em?: string | null
          pago_em?: string | null
          forma_pagamento?: string | null
          shopify_order_id?: string | null
          criado_por?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          numero?: never
          cliente_id?: string
          pre_venda_id?: string | null
          canal?: Database["public"]["Enums"]["canal_venda"]
          origem?: Database["public"]["Enums"]["origem_pedido"]
          status?: Database["public"]["Enums"]["status_pedido"]
          status_pagamento?: Database["public"]["Enums"]["status_pagamento"]
          subtotal?: number
          taxa_entrega?: number
          desconto?: number
          total?: never
          endereco_entrega?: Json | null
          observacoes?: string | null
          cobrancas_enviadas?: number
          ultima_cobranca_em?: string | null
          pago_em?: string | null
          forma_pagamento?: string | null
          shopify_order_id?: string | null
          criado_por?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_pre_venda_id_fkey"
            columns: ["pre_venda_id"]
            isOneToOne: false
            referencedRelation: "pre_vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_erp: {
        Row: {
          id: number
          numero: number | null
          canal: string
          ecommerce: string | null
          situacao: number
          data_pedido: string
          valor: number
          sincronizado_em: string
        }
        Insert: {
          id: number
          numero?: number | null
          canal: string
          ecommerce?: string | null
          situacao?: number
          data_pedido: string
          valor?: number
          sincronizado_em?: string
        }
        Update: {
          id?: number
          numero?: number | null
          canal?: string
          ecommerce?: string | null
          situacao?: number
          data_pedido?: string
          valor?: number
          sincronizado_em?: string
        }
        Relationships: []
      }
      perfis: {
        Row: {
          id: string
          nome: string
          email: string | null
          cargo: string | null
          papel: Database["public"]["Enums"]["papel_usuario"]
          ativo: boolean
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id: string
          nome?: string
          email?: string | null
          cargo?: string | null
          papel?: Database["public"]["Enums"]["papel_usuario"]
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          email?: string | null
          cargo?: string | null
          papel?: Database["public"]["Enums"]["papel_usuario"]
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      pre_venda_itens: {
        Row: {
          id: string
          pre_venda_id: string
          produto_id: string
          preco: number
          limite_por_cliente: number | null
          quantidade_disponivel: number | null
          ordem: number
        }
        Insert: {
          id?: string
          pre_venda_id: string
          produto_id: string
          preco: number
          limite_por_cliente?: number | null
          quantidade_disponivel?: number | null
          ordem?: number
        }
        Update: {
          id?: string
          pre_venda_id?: string
          produto_id?: string
          preco?: number
          limite_por_cliente?: number | null
          quantidade_disponivel?: number | null
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "pre_venda_itens_pre_venda_id_fkey"
            columns: ["pre_venda_id"]
            isOneToOne: false
            referencedRelation: "pre_vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_vendas: {
        Row: {
          id: string
          titulo: string
          descricao: string | null
          slug: string
          canal: Database["public"]["Enums"]["canal_venda"]
          status: Database["public"]["Enums"]["status_pre_venda"]
          encerra_em: string | null
          previsao_entrega: string | null
          taxa_entrega: number
          criado_por: string | null
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          titulo: string
          descricao?: string | null
          slug?: string
          canal?: Database["public"]["Enums"]["canal_venda"]
          status?: Database["public"]["Enums"]["status_pre_venda"]
          encerra_em?: string | null
          previsao_entrega?: string | null
          taxa_entrega?: number
          criado_por?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          titulo?: string
          descricao?: string | null
          slug?: string
          canal?: Database["public"]["Enums"]["canal_venda"]
          status?: Database["public"]["Enums"]["status_pre_venda"]
          encerra_em?: string | null
          previsao_entrega?: string | null
          taxa_entrega?: number
          criado_por?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_vendas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          id: string
          nome: string
          estilo: string | null
          cervejaria: string | null
          fornecedor_id: string | null
          volume_ml: number | null
          teor_alcoolico: number | null
          descricao: string | null
          preco: number
          imagem_url: string | null
          sku: string | null
          ativo: boolean
          shopify_product_id: string | null
          shopify_variant_id: string | null
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          nome: string
          estilo?: string | null
          cervejaria?: string | null
          fornecedor_id?: string | null
          volume_ml?: number | null
          teor_alcoolico?: number | null
          descricao?: string | null
          preco?: number
          imagem_url?: string | null
          sku?: string | null
          ativo?: boolean
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          estilo?: string | null
          cervejaria?: string | null
          fornecedor_id?: string | null
          volume_ml?: number | null
          teor_alcoolico?: number | null
          descricao?: string | null
          preco?: number
          imagem_url?: string | null
          sku?: string | null
          ativo?: boolean
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedores: {
        Row: {
          id: string
          nome: string
          whatsapp: string | null
          email: string | null
          observacoes: string | null
          ativo: boolean
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          nome: string
          whatsapp?: string | null
          email?: string | null
          observacoes?: string | null
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          whatsapp?: string | null
          email?: string | null
          observacoes?: string | null
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          id: string
          nome: string
          url: string
          eventos: string[]
          segredo: string
          ativo: boolean
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          nome: string
          url: string
          eventos?: string[]
          segredo?: string
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          url?: string
          eventos?: string[]
          segredo?: string
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_clientes: {
        Row: {
          id: string | null
          nome: string | null
          whatsapp: string | null
          email: string | null
          cpf: string | null
          data_nascimento: string | null
          cep: string | null
          logradouro: string | null
          numero: string | null
          complemento: string | null
          bairro: string | null
          cidade: string | null
          uf: string | null
          referencia: string | null
          vip: boolean | null
          tags: string[] | null
          origem: Database["public"]["Enums"]["origem_cliente"] | null
          observacoes: string | null
          shopify_customer_id: string | null
          app_usuario_id: string | null
          criado_em: string | null
          atualizado_em: string | null
          pedidos: number | null
          total_gasto: number | null
          em_aberto: number | null
          ultimo_pedido_em: string | null
        }
        Relationships: []
      }
      vw_contas_pagar: {
        Row: {
          id: string | null
          descricao: string | null
          categoria: string | null
          tipo: Database["public"]["Enums"]["tipo_conta"] | null
          fornecedor_id: string | null
          conta_fixa_id: string | null
          competencia: string | null
          vencimento: string | null
          valor: number | null
          status: Database["public"]["Enums"]["status_conta"] | null
          pago_em: string | null
          valor_pago: number | null
          forma_pagamento: string | null
          observacoes: string | null
          criado_em: string | null
          atualizado_em: string | null
          fornecedor_nome: string | null
          situacao: string | null
        }
        Relationships: []
      }
      vw_contas_receber: {
        Row: {
          id: string | null
          descricao: string | null
          categoria: string | null
          pagador: string | null
          competencia: string | null
          vencimento: string | null
          valor: number | null
          status: Database["public"]["Enums"]["status_recebimento"] | null
          recebido_em: string | null
          valor_recebido: number | null
          forma_pagamento: string | null
          observacoes: string | null
          criado_em: string | null
          atualizado_em: string | null
          situacao: string | null
        }
        Relationships: []
      }
      vw_pedidos: {
        Row: {
          id: string | null
          numero: number | null
          cliente_id: string | null
          pre_venda_id: string | null
          canal: Database["public"]["Enums"]["canal_venda"] | null
          origem: Database["public"]["Enums"]["origem_pedido"] | null
          status: Database["public"]["Enums"]["status_pedido"] | null
          status_pagamento: Database["public"]["Enums"]["status_pagamento"] | null
          subtotal: number | null
          taxa_entrega: number | null
          desconto: number | null
          total: number | null
          endereco_entrega: Json | null
          observacoes: string | null
          cobrancas_enviadas: number | null
          ultima_cobranca_em: string | null
          pago_em: string | null
          forma_pagamento: string | null
          shopify_order_id: string | null
          criado_por: string | null
          criado_em: string | null
          atualizado_em: string | null
          cliente_nome: string | null
          cliente_whatsapp: string | null
          pre_venda_titulo: string | null
          unidades: number | null
        }
        Relationships: []
      }
      vw_pre_venda_itens: {
        Row: {
          id: string | null
          pre_venda_id: string | null
          produto_id: string | null
          preco: number | null
          limite_por_cliente: number | null
          quantidade_disponivel: number | null
          ordem: number | null
          nome: string | null
          estilo: string | null
          cervejaria: string | null
          volume_ml: number | null
          teor_alcoolico: number | null
          descricao: string | null
          imagem_url: string | null
          vendido: number | null
          restante: number | null
        }
        Relationships: []
      }
      vw_pre_vendas: {
        Row: {
          id: string | null
          titulo: string | null
          descricao: string | null
          slug: string | null
          canal: Database["public"]["Enums"]["canal_venda"] | null
          status: Database["public"]["Enums"]["status_pre_venda"] | null
          encerra_em: string | null
          previsao_entrega: string | null
          taxa_entrega: number | null
          criado_por: string | null
          criado_em: string | null
          atualizado_em: string | null
          status_efetivo: Database["public"]["Enums"]["status_pre_venda"] | null
          pedidos: number | null
          total_vendido: number | null
          total_recebido: number | null
          unidades: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aplicar_conta_fixa_aos_pendentes: {
        Args: {
          p_conta_fixa_id: string
        }
        Returns: number
      }
      criar_pedido: {
        Args: {
          p_cliente_id: string
          p_itens: Json
          p_pre_venda_id?: string
          p_canal?: Database["public"]["Enums"]["canal_venda"]
          p_origem?: Database["public"]["Enums"]["origem_pedido"]
          p_observacoes?: string
          p_endereco?: Json
          p_taxa_entrega?: number
          p_desconto?: number
        }
        Returns: {
          id: string
          numero: number
          cliente_id: string
          pre_venda_id: string | null
          canal: Database["public"]["Enums"]["canal_venda"]
          origem: Database["public"]["Enums"]["origem_pedido"]
          status: Database["public"]["Enums"]["status_pedido"]
          status_pagamento: Database["public"]["Enums"]["status_pagamento"]
          subtotal: number
          taxa_entrega: number
          desconto: number
          total: number
          endereco_entrega: Json | null
          observacoes: string | null
          cobrancas_enviadas: number
          ultima_cobranca_em: string | null
          pago_em: string | null
          forma_pagamento: string | null
          shopify_order_id: string | null
          criado_por: string | null
          criado_em: string
          atualizado_em: string
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      definir_empresas_do_vendedor: {
        Args: {
          p_vendedor_id: string
          p_fornecedor_ids?: string[]
          p_novas_empresas?: string[]
        }
        Returns: undefined
      }
      desconectar_olist: {
        Args: never
        Returns: undefined
      }
      eh_admin: {
        Args: never
        Returns: boolean
      }
      eh_membro_equipe: {
        Args: never
        Returns: boolean
      }
      endereco_do_cliente: {
        Args: {
          p_cliente: unknown
        }
        Returns: Json
      }
      excluir_categoria_financeira: {
        Args: {
          p_id: string
        }
        Returns: undefined
      }
      gerar_contas_fixas: {
        Args: {
          p_competencia: string
        }
        Returns: number
      }
      hoje_brasilia: {
        Args: never
        Returns: string
      }
      identificar_cliente_pre_venda: {
        Args: {
          p_whatsapp: string
        }
        Returns: Json
      }
      importar_pedido_shopify: {
        Args: {
          p_pedido: Json
        }
        Returns: string
      }
      metricas_painel: {
        Args: {
          p_inicio: string
          p_fim: string
        }
        Returns: Json
      }
      normalizar_whatsapp: {
        Args: {
          p_numero: string
        }
        Returns: string
      }
      pedido_json: {
        Args: {
          p_pedido_id: string
        }
        Returns: Json
      }
      receita_semanal: {
        Args: {
          p_semanas?: number
        }
        Returns: {
          semana: string
          canal: Database["public"]["Enums"]["canal_venda"]
          total: number
          pedidos: number
        }[]
      }
      registrar_cobranca: {
        Args: {
          p_pedido_id: string
        }
        Returns: {
          id: string
          numero: number
          cliente_id: string
          pre_venda_id: string | null
          canal: Database["public"]["Enums"]["canal_venda"]
          origem: Database["public"]["Enums"]["origem_pedido"]
          status: Database["public"]["Enums"]["status_pedido"]
          status_pagamento: Database["public"]["Enums"]["status_pagamento"]
          subtotal: number
          taxa_entrega: number
          desconto: number
          total: number
          endereco_entrega: Json | null
          observacoes: string | null
          cobrancas_enviadas: number
          ultima_cobranca_em: string | null
          pago_em: string | null
          forma_pagamento: string | null
          shopify_order_id: string | null
          criado_por: string | null
          criado_em: string
          atualizado_em: string
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_evento: {
        Args: {
          p_tipo: string
          p_entidade: string
          p_entidade_id: string
          p_payload: Json
        }
        Returns: string
      }
      registrar_pedido_pre_venda: {
        Args: {
          p_slug: string
          p_cliente: Json
          p_itens: Json
          p_atualizar_endereco?: boolean
          p_observacoes?: string
        }
        Returns: {
          id: string
          numero: number
          cliente_id: string
          pre_venda_id: string | null
          canal: Database["public"]["Enums"]["canal_venda"]
          origem: Database["public"]["Enums"]["origem_pedido"]
          status: Database["public"]["Enums"]["status_pedido"]
          status_pagamento: Database["public"]["Enums"]["status_pagamento"]
          subtotal: number
          taxa_entrega: number
          desconto: number
          total: number
          endereco_entrega: Json | null
          observacoes: string | null
          cobrancas_enviadas: number
          ultima_cobranca_em: string | null
          pago_em: string | null
          forma_pagamento: string | null
          shopify_order_id: string | null
          criado_por: string | null
          criado_em: string
          atualizado_em: string
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      renomear_categoria_financeira: {
        Args: {
          p_id: string
          p_nome: string
        }
        Returns: undefined
      }
      resumo_produtos_vendidos: {
        Args: {
          p_canal?: Database["public"]["Enums"]["canal_venda"]
          p_pre_venda_id?: string
          p_inicio?: string
          p_fim?: string
          p_status_pagamento?: Database["public"]["Enums"]["status_pagamento"]
        }
        Returns: {
          produto_id: string
          descricao: string
          estilo: string
          quantidade: number
          total: number
          pedidos: number
        }[]
      }
      salvar_conexao_olist: {
        Args: {
          p_access_token: string
          p_refresh_token: string
          p_access_expira_em: string
          p_refresh_expira_em: string
        }
        Returns: undefined
      }
      salvar_pre_venda: {
        Args: {
          p_dados: Json
          p_itens: Json
          p_id?: string
        }
        Returns: {
          id: string
          titulo: string
          descricao: string | null
          slug: string
          canal: Database["public"]["Enums"]["canal_venda"]
          status: Database["public"]["Enums"]["status_pre_venda"]
          encerra_em: string | null
          previsao_entrega: string | null
          taxa_entrega: number
          criado_por: string | null
          criado_em: string
          atualizado_em: string
        }
        SetofOptions: {
          from: "*"
          to: "pre_vendas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      situacao_erp_conta_venda: {
        Args: {
          p_situacao: number
        }
        Returns: boolean
      }
      somente_digitos: {
        Args: {
          p_texto: string
        }
        Returns: string
      }
      status_integracao_olist: {
        Args: never
        Returns: Json
      }
      vendas_crm_por_dia: {
        Args: {
          p_canal: Database["public"]["Enums"]["canal_venda"]
          p_inicio: string
          p_fim: string
        }
        Returns: {
          dia: string
          valor: number
          pedidos: number
        }[]
      }
      vendas_erp_por_canal: {
        Args: {
          p_inicio: string
          p_fim: string
        }
        Returns: {
          canal: string
          valor: number
          pedidos: number
        }[]
      }
      vendas_erp_por_dia: {
        Args: {
          p_inicio: string
          p_fim: string
        }
        Returns: {
          dia: string
          canal: string
          valor: number
          pedidos: number
        }[]
      }
    }
    Enums: {
      canal_venda: "grupo_vip" | "whatsapp" | "loja" | "shopify" | "app"
      natureza_financeira: "pagar" | "receber"
      origem_cliente: "manual" | "pre_venda" | "shopify" | "app" | "importacao"
      origem_pedido: "link" | "manual" | "shopify" | "app" | "api"
      papel_usuario: "admin" | "equipe"
      status_conta: "pendente" | "paga" | "cancelada"
      status_evento: "pendente" | "enviado" | "erro" | "ignorado"
      status_pagamento: "pendente" | "cobrado" | "pago" | "estornado"
      status_pedido: "novo" | "confirmado" | "separado" | "entregue" | "cancelado"
      status_pre_venda: "rascunho" | "ativa" | "encerrada"
      status_recebimento: "pendente" | "recebida" | "cancelada"
      tipo_conta: "fixa" | "variavel"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      canal_venda: ["grupo_vip", "whatsapp", "loja", "shopify", "app"],
      natureza_financeira: ["pagar", "receber"],
      origem_cliente: ["manual", "pre_venda", "shopify", "app", "importacao"],
      origem_pedido: ["link", "manual", "shopify", "app", "api"],
      papel_usuario: ["admin", "equipe"],
      status_conta: ["pendente", "paga", "cancelada"],
      status_evento: ["pendente", "enviado", "erro", "ignorado"],
      status_pagamento: ["pendente", "cobrado", "pago", "estornado"],
      status_pedido: ["novo", "confirmado", "separado", "entregue", "cancelado"],
      status_pre_venda: ["rascunho", "ativa", "encerrada"],
      status_recebimento: ["pendente", "recebida", "cancelada"],
      tipo_conta: ["fixa", "variavel"],
    },
  },
} as const

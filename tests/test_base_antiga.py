"""Testes do preparo da base antiga com dados fictícios (tests/fixtures/base_antiga_exemplo.csv)."""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from base_antiga_preparar import preparar, resumo, celular_e164  # noqa: E402

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "base_antiga_exemplo.csv")


class BaseAntiga(unittest.TestCase):
    def setUp(self):
        self.linhas, self.descartadas = preparar(FIX)
        self.por_email = {l["email"]: l for l in self.linhas}

    def test_e_mail_repetido_descartado(self):
        self.assertEqual(len(self.linhas), 5)
        self.assertEqual(self.descartadas, 1)

    def test_p1_whatsapp_e_email(self):
        l = self.por_email["fulana.exemplo@exemplo.invalid"]
        self.assertEqual((l["prioridade"], l["canal_inicial"], l["whatsapp_e164"]), ("P1", "whatsapp_email", "+5511900000001"))

    def test_p2_email_primeiro(self):
        self.assertEqual(self.por_email["beltrano@exemplo.invalid"]["canal_inicial"], "email_depois_whatsapp_lotes")

    def test_telefone_incompleto_ou_ausente_sem_whatsapp(self):
        for e in ("ciclana@exemplo.invalid", "semtelefone@exemplo.invalid"):
            self.assertFalse(self.por_email[e]["whatsapp_ok"], e)
            self.assertIsNone(self.por_email[e]["whatsapp_e164"], e)

    def test_cadastro_de_teste_vai_para_revisao(self):
        l = self.por_email["teste@exemplo.invalid"]
        self.assertTrue(l["revisar"])
        self.assertEqual(l["status"], "revisar")

    def test_celular(self):
        self.assertEqual(celular_e164("+55 (11) 90000-0001"), "+5511900000001")
        self.assertIsNone(celular_e164("+551130000003"))
        self.assertIsNone(celular_e164(""))

    def test_resumo_sem_dados_pessoais(self):
        r = resumo(self.linhas, self.descartadas)
        self.assertNotIn("@", str(r))


if __name__ == "__main__":
    unittest.main()

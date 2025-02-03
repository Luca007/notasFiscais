document.addEventListener('DOMContentLoaded', () => {
    const cpfInput = document.getElementById('cpfInput');
    const validateCpfBtn = document.getElementById('validateCpfBtn');
    const uploadSection = document.getElementById('uploadSection');
    const examHistorySection = document.getElementById('examHistorySection');
    const examList = document.getElementById('examList');
    const uploadButton = document.getElementById('uploadButton');
    const imageUpload = document.getElementById('imageUpload');
    const previewImg = document.getElementById('previewImg');
    const imagePreview = document.getElementById('imagePreview');
    const processButton = document.getElementById('processButton');
    const extractedText = document.getElementById('extractedText');
    const saveExamBtn = document.getElementById('saveExamBtn');

    // Obtenção da instância do Firestore (já inicializada no index.html)
    // via "const db = firebase.firestore();"
    // mas podemos acessá-la aqui se quiser: "firebase.firestore()"
    // Vamos usar a variável global `db`.

    let currentCPF = '';

    /*******************************************************
     * FIRESTORE HELPER FUNCTIONS
     *******************************************************/
    // Salvar nota em Firestore, dentro de /notas/<cpf>/userNotes
    function saveNoteToFirestore(cpf, noteObj) {
      return db
        .collection("notas")
        .doc(cpf)
        .collection("userNotes")
        .add(noteObj)
        .then(() => {
          console.log("Nota salva no Firestore com sucesso!");
        })
        .catch((err) => {
          console.error("Erro ao salvar no Firestore:", err);
        });
    }

    // Carregar notas de Firestore para determinado CPF
    function loadNotesFromFirestore(cpf) {
      return db
        .collection("notas")
        .doc(cpf)
        .collection("userNotes")
        .get()
        .then((querySnapshot) => {
          const notes = [];
          querySnapshot.forEach((doc) => {
            notes.push(doc.data());
          });
          return notes;
        })
        .catch((err) => {
          console.error("Erro ao carregar do Firestore:", err);
          return [];
        });
    }

    /*******************************************************
     * FUNÇÃO para carregar histórico e exibir na <ul>
     *******************************************************/
    function loadExamHistory(cpf) {
      examList.innerHTML = 'Carregando notas...';

      // Buscando do Firestore
      loadNotesFromFirestore(cpf).then(existingNotes => {
        examList.innerHTML = '';

        if (existingNotes.length === 0) {
          const noNotesItem = document.createElement('li');
          noNotesItem.textContent = 'Nenhuma nota fiscal encontrada';
          examList.appendChild(noNotesItem);
        } else {
          existingNotes.forEach(note => {
            const noteItem = document.createElement('li');
            noteItem.innerHTML = `
              <strong>Data de Salvamento:</strong> ${note.date}<br>
              <strong>Valor Total:</strong> ${note.totalValue || '---'}<br>
              <strong>Número:</strong> ${note.registrationNumber || '---'}<br>
              <strong>Data/Hora Emissão:</strong> ${note.emissionDateTime || '---'}<br>
              <strong>Código de Verificação:</strong> ${note.verificationCode || '---'}<br>
              <strong>Descrição do Serviço:</strong> ${note.serviceDescription || '---'}<br>
              <hr>
              <strong>CPF Vinculado:</strong> ${note.cpf || '---'}
            `;
            examList.appendChild(noteItem);
          });
        }
        examHistorySection.style.display = 'block';
      });
    }

    /*******************************************************
     * Validação e formatação de CPF
     *******************************************************/
    function validateCPF(cpf) {
      cpf = cpf.replace(/[^\d]/g, '');
      if (cpf.length !== 11) return false;
      if (/^(\d)\1+$/.test(cpf)) return false;

      let sum = 0;
      for (let i = 0; i < 9; i++) {
        sum += parseInt(cpf.charAt(i)) * (10 - i);
      }
      let remainder = 11 - (sum % 11);
      if (remainder === 10 || remainder === 11) remainder = 0;
      if (remainder !== parseInt(cpf.charAt(9))) return false;

      sum = 0;
      for (let i = 0; i < 10; i++) {
        sum += parseInt(cpf.charAt(i)) * (11 - i);
      }
      remainder = 11 - (sum % 11);
      if (remainder === 10 || remainder === 11) remainder = 0;
      return remainder === parseInt(cpf.charAt(10));
    }

    function formatDCF(value) {
      value = value.replace(/\D/g, '');
      if (value.length > 11) {
        value = value.slice(0, 11);
      }
      return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    /*******************************************************
     * Extração do Valor Total
     *******************************************************/
    function extractTotalValue(text) {
      const totalValuePatterns = [
        /(?:valor\s*total\s*(?:dos\s*serviços)?):?\s*(?:r\$)?\s*(\d+(?:,\d{2})?)/i,
        /(?:total):?\s*(?:r\$)?\s*(\d+(?:,\d{2})?)/i,
        /(?:vl\.\s*total\s*(?:dos\s*serviços)?):?\s*(?:r\$)?\s*(\d+(?:,\d{2})?)/i,
        /r\$\s*(\d+(?:,\d{2})?)/i,
        /valor:?\s*(?:r\$)?\s*(\d+(?:,\d{2})?)/i
      ];
      for (const pattern of totalValuePatterns) {
        const match = text.match(pattern);
        if (match) {
          return match[1];
        }
      }
      return null;
    }

    /*******************************************************
     * Extração do CPF
     *******************************************************/
    function extractCPF(text) {
      const cpfPatterns = [
        /(?:CPF|C\.P\.F\.?):?\s*(\d{3}\.\d{3}\.\d{3}-\d{2})/i,
        /(?:CPF|C\.P\.F\.?):?\s*(\d{11})/i,
        /(\d{3}\.\d{3}\.\d{3}-\d{2})/,
        /(\d{11})/
      ];
      for (const pattern of cpfPatterns) {
        const match = text.match(pattern);
        if (match) {
          let extractedCpf = match[1];
          if (extractedCpf.length === 11) {
            extractedCpf = extractedCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
          }
          if (validateCPF(extractedCpf.replace(/[^\d]/g, ''))) {
            return extractedCpf;
          }
        }
      }
      return null;
    }

    /*******************************************************
     * Extração da Descrição do Serviço
     * Exemplo: Tenta achar "DISCRIMINAÇÃO DOS SERVIÇOS" e lê até a próxima linha em branco ou "VALOR TOTAL"
     *******************************************************/
    function extractServiceDescription(text) {
      // Vamos fazer uma regex que pegue do "DISCRIMINAÇÃO DOS SERVIÇOS" até "VALOR TOTAL" ou fim de string
      // de forma simples. Ajuste se quiser algo mais refinado.
      const pattern = /discrimina[cç][aã]o\s+dos\s+servi[cç]os([\s\S]*?)(?=\n\n|valor total|r\$|\Z)/i;
      const match = text.match(pattern);
      if (match) {
        // Limpamos e retornamos
        return match[1].trim();
      }
      return null;
    }

    /*******************************************************
     * Extração de Campos (Número, Data/Hora, Código)
     *******************************************************/
    function extractAdditionalFields(text) {
      const fields = {
        registrationNumber: null,
        emissionDateTime: null,
        verificationCode: null
      };

      // (Seu parser atual)
      const synonymsNumber = ["número", "numero", "num", "registro", "nº", "n°"];
      const synonymsDate = ["data e hora de emissão","data/hora de emissão","data e hora","emissão"];
      const synonymsCode = ["código de verificação","cod. verificação","verificação","codigo verif"];

      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      function removeAccents(str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      }
      function isLikelyTitle(line, synArray) {
        const norm = removeAccents(line.toLowerCase());
        return synArray.some(syn => norm.includes(removeAccents(syn.toLowerCase())));
      }

      // Detecta se a linha tem pelo menos 2 títulos
      function detectMultiTitles(line) {
        const norm = removeAccents(line.toLowerCase());
        let found = [];
        if (synonymsNumber.some(s => norm.includes(removeAccents(s.toLowerCase())))) found.push("number");
        if (synonymsDate.some(s => norm.includes(removeAccents(s.toLowerCase()))))   found.push("date");
        if (synonymsCode.some(s => norm.includes(removeAccents(s.toLowerCase()))))   found.push("code");
        return (found.length >= 2) ? found : null;
      }

      function parseColumns(lines, startIndex) {
        let combined = [];
        for (let i = startIndex + 1; i <= startIndex + 2 && i < lines.length; i++) {
          combined.push(lines[i]);
        }
        const joined = combined.join(" ").trim();
        const tokens = joined.split(/\s+/).filter(Boolean);

        const reDate = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
        const reTime = /^\d{1,2}:\d{2}:\d{2}$/;

        let result = {
          number: "",
          date: "",
          code: ""
        };

        let state = "number";

        for (let i = 0; i < tokens.length; i++) {
          let tk = tokens[i];
          const isDate = reDate.test(tk);
          const isTime = reTime.test(tk);
          const isAllDigits = /^\d+$/.test(tk);

          switch (state) {
            case "number":
              if (isDate) {
                result.date = tk;
                state = "date";
              } else {
                if (result.number) result.number += " ";
                result.number += tk;
              }
              break;
            case "date":
              if (isTime) {
                result.date += " " + tk;
              } else {
                if (isAllDigits && tk.length >= 5 && tk.length <= 12) {
                  if (result.number) result.number += " ";
                  result.number += tk;
                } else {
                  result.code = tk;
                  state = "code";
                }
              }
              break;
            case "maybeNumberOrCode":
              if (isAllDigits && tk.length >= 5 && tk.length <= 12) {
                if (result.number) result.number += " ";
                result.number += tk;
              } else {
                if (result.code) result.code += " ";
                result.code += tk;
              }
              break;
            case "code":
            default:
              if (isAllDigits && tk.length >= 5 && tk.length <= 12) {
                if (result.number) result.number += " ";
                result.number += tk;
              } else {
                if (result.code) result.code += " ";
                result.code += tk;
              }
              break;
          }

          if (state === "date" && !isDate && !isTime) {
            if (!(isAllDigits && tk.length >= 5 && tk.length <= 12)) {
              state = "code";
            }
          }
        }

        if (state === "date") state = "code";

        result.number = result.number.trim();
        result.date   = result.date.trim();
        result.code   = result.code.trim();

        return result;
      }

      // Tentar parsing colunas
      for (let i = 0; i < lines.length; i++) {
        const multi = detectMultiTitles(lines[i]);
        if (multi) {
          let col = parseColumns(lines, i);
          if (col.number) fields.registrationNumber = col.number;
          if (col.date) fields.emissionDateTime = col.date;
          if (col.code) fields.verificationCode = col.code;
        }
      }

      // Vertical approach
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!fields.registrationNumber && isLikelyTitle(line, synonymsNumber)) {
          const reEnd = /\b(\S{3,})$/;
          const matchLine = line.match(reEnd);
          if (matchLine) {
            fields.registrationNumber = matchLine[1].trim();
          } else {
            let nextLine = lines[i+1]||"";
            if (!isLikelyTitle(nextLine,synonymsNumber)&&
                !isLikelyTitle(nextLine,synonymsDate)&&
                !isLikelyTitle(nextLine,synonymsCode)) {
              fields.registrationNumber = nextLine.trim();
            }
          }
        }
        if (!fields.emissionDateTime && isLikelyTitle(line, synonymsDate)) {
          let reDT = /(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+(\d{1,2}:\d{2}:\d{2}))?/;
          let mLine = line.match(reDT);
          if (mLine) {
            fields.emissionDateTime = mLine[0];
          } else {
            let nextLine = lines[i+1]||"";
            let mNext = nextLine.match(reDT);
            if (mNext) fields.emissionDateTime = mNext[0];
          }
        }
        if (!fields.verificationCode && isLikelyTitle(line, synonymsCode)) {
          let matchLine = line.match(/([A-Za-z0-9]{5,}[^\s]*)$/);
          if (matchLine) {
            fields.verificationCode = matchLine[1].trim();
          } else {
            const nextLine = lines[i+1]||"";
            if (!isLikelyTitle(nextLine,synonymsNumber)&&
                !isLikelyTitle(nextLine,synonymsDate)&&
                !isLikelyTitle(nextLine,synonymsCode)) {
              fields.verificationCode = nextLine.trim();
            }
          }
        }
      }

      // Regex de backup
      if (!fields.registrationNumber) {
        const reNum = /(?:n[uú]mero|registro)[^\n]*?(\S.*)/i;
        const mNum = text.match(reNum);
        if (mNum) fields.registrationNumber = mNum[1].trim();
      }
      if (!fields.emissionDateTime) {
        const reDT = /(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2})/;
        const mDT = text.match(reDT);
        if (mDT) {
          fields.emissionDateTime = mDT[1];
        } else {
          const reD = /(\d{1,2}\/\d{1,2}\/\d{4})/;
          const mD = text.match(reD);
          if (mD) fields.emissionDateTime = mD[1];
        }
      }
      if (!fields.verificationCode) {
        const reCode = /(?:c[oó]digo\s+(?:de\s+)?verifica[cç][aã]o)[^\n]*?([\w-]{5,}[\w\s-]*)/i;
        const mC = text.match(reCode);
        if (mC) fields.verificationCode = mC[1].trim();
      }

      return fields;
    }

    /*******************************************************
     * EVENTO: Validar CPF (Botão)
     *******************************************************/
    validateCpfBtn.addEventListener('click', () => {
      const rawCpf = cpfInput.value;
      const formattedCpf = formatDCF(rawCpf);
      
      cpfInput.value = formattedCpf;
      
      if (validateCPF(rawCpf.replace(/[^\d]/g, ''))) {
        currentCPF = formattedCpf;
        cpfInput.classList.remove('error');
        uploadSection.style.display = 'block';
        
        // Carregar histórico do Firestore
        loadExamHistory(currentCPF);

      } else {
        cpfInput.classList.add('error');
        uploadSection.style.display = 'none';
        alert('CPF inválido. Por favor, digite um CPF válido.');
      }
    });

    // Mask CPF input
    cpfInput.addEventListener('input', (e) => {
      e.target.value = formatDCF(e.target.value);
    });

    /*******************************************************
     * UPLOAD da Imagem
     *******************************************************/
    uploadButton.addEventListener('click', () => {
      imageUpload.click();
    });
  
    imageUpload.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          imagePreview.style.display = 'block';
          processButton.disabled = false;
        };
        reader.readAsDataURL(file);
      }
    });

    /*******************************************************
     * OCR PROCESS
     *******************************************************/
    processButton.addEventListener('click', async () => {
      const progressContainer = document.querySelector('.progress-container');
      const progressBar = document.getElementById('progressBar');
      const progressText = document.getElementById('progressText');

      progressContainer.style.display = 'block';
      progressBar.style.width = '0%';
      progressText.textContent = 'Iniciando OCR...';

      extractedText.value = 'Processando... Por favor, aguarde.';

      try {
        const result = await Tesseract.recognize(
          previewImg.src,
          'por', 
          {
            logger: m => {
              console.log(m);
              if (m.status === 'recognizing text') {
                const pct = Math.round(m.progress * 100);
                progressBar.style.width = pct + '%';
                progressText.textContent = `Reconhecimento: ${pct}%`;
              } else {
                progressText.textContent = m.status;
              }
            }
          }
        );

        progressBar.style.width = '100%';
        progressText.textContent = 'Reconhecimento: 100%';

        const extractedContent = result.data.text || 'Nenhum texto encontrado.';
        extractedText.value = extractedContent;

        // Extrações
        const totalValue = extractTotalValue(extractedContent);
        const extractedCPF = extractCPF(extractedContent);
        const additionalFields = extractAdditionalFields(extractedContent);
        const serviceDescription = extractServiceDescription(extractedContent);

        if (totalValue) {
          extractedText.value += `\n\nValor Total: R$ ${totalValue}`;
        }
        if (extractedCPF) {
          if (!cpfInput.value) {
            cpfInput.value = extractedCPF;
            validateCpfBtn.click();
          }
          extractedText.value += `\n\nCPF Extraído: ${extractedCPF}`;
        }
        if (additionalFields.registrationNumber) {
          extractedText.value += `\n\nNúmero de Registro: ${additionalFields.registrationNumber}`;
        }
        if (additionalFields.emissionDateTime) {
          extractedText.value += `\n\nData e Hora de Emissão: ${additionalFields.emissionDateTime}`;
        }
        if (additionalFields.verificationCode) {
          extractedText.value += `\n\nCódigo de Verificação: ${additionalFields.verificationCode}`;
        }
        if (serviceDescription) {
          extractedText.value += `\n\nDescrição do Serviço: ${serviceDescription}`;
        }

        saveExamBtn.style.display = 'block';

      } catch (error) {
        console.error('Erro no processamento OCR:', error);
        extractedText.value = 'Erro ao processar imagem.';
      } finally {
        setTimeout(() => {
          progressContainer.style.display = 'none';
        }, 2000);
      }
    });

    /*******************************************************
     * Salvar Nota (Botão "Salvar Nota Fiscal")
     *******************************************************/
    saveExamBtn.addEventListener('click', () => {
      if (!currentCPF) {
        alert('Por favor, valide o CPF primeiro.');
        return;
      }

      // Extraindo as infos do textarea
      const totalValueMatch = extractedText.value.match(/Valor Total: R\$ ([\d,]+)/);
      const registrationNumberMatch = extractedText.value.match(/Número de Registro: ([^\n]+)/);
      const emissionDateTimeMatch = extractedText.value.match(/Data e Hora de Emissão: ([^\n]+)/);
      const verificationCodeMatch = extractedText.value.match(/Código de Verificação: ([^\n]+)/);
      const serviceDescMatch = extractedText.value.match(/Descrição do Serviço: ([\s\S]+)/);

      // Montamos o objeto
      const newNote = {
        cpf: currentCPF, // associar o CPF
        date: new Date().toLocaleString(), // data de salvamento
        totalValue: totalValueMatch ? totalValueMatch[1].trim() : null,
        registrationNumber: registrationNumberMatch ? registrationNumberMatch[1].trim() : null,
        emissionDateTime: emissionDateTimeMatch ? emissionDateTimeMatch[1].trim() : null,
        verificationCode: verificationCodeMatch ? verificationCodeMatch[1].trim() : null,
        serviceDescription: serviceDescMatch ? serviceDescMatch[1].trim() : null
      };

      // Salvar no Firestore
      saveNoteToFirestore(currentCPF, newNote)
        .then(() => {
          alert('Nota Fiscal salva com sucesso no Firestore!');
          loadExamHistory(currentCPF);
          saveExamBtn.style.display = 'none';
        })
        .catch((err) => {
          console.error("Erro ao salvar nota no Firestore:", err);
        });
    });

    // Caso precise manter loadNoteHistory
    function loadNoteHistory(cpf) {
      loadExamHistory(cpf);
    }
});

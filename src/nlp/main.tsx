import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';
import '../styles/index.css';

// NLP 모드의 transformers.js env 설정은 NER 워커 내부 (`src/workers/nerEnv.ts`) 에서
// `configureWorkerEnv()` 가 처리한다. 메인 스레드는 워커에게만 모델 로드 명령을 RPC 로
// 보내므로 transformers.js 를 import 할 필요가 없다 — 메인 번들에 import 하면 워커 번들과
// 합쳐 ~40MB 의 중복 inline 이 발생해 build:nlp 사이즈 예산을 깨뜨린다.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

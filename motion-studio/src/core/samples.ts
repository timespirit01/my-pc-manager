// 회원가입 없이 바로 체험할 수 있는 샘플 자료 (이미지는 scripts/make-samples.mjs로 직접 제작)
import type { Asset, MaterialInput, Purpose } from './types';

const A = (id: string, file: string, width: number, height: number, name: string): Asset => ({
  id, url: `/samples/${file}`, width, height, name,
});

export const SAMPLE_ASSETS: Record<string, Asset> = {
  s_coffee_hero: A('s_coffee_hero', 'coffee-hero.jpg', 1800, 1200, '원두와 커피잔'),
  s_coffee_pour: A('s_coffee_pour', 'coffee-pour.jpg', 1080, 1440, '핸드드립'),
  s_coffee_beans: A('s_coffee_beans', 'coffee-beans.jpg', 1400, 1400, '원두 클로즈업'),
  s_market: A('s_market', 'market.jpg', 1800, 1200, '가을 장터'),
  s_cleaning: A('s_cleaning', 'cleaning.jpg', 1200, 1500, '깨끗한 거실'),
  s_logo_onggi: A('s_logo_onggi', 'logo-onggi.png', 900, 260, '온기 로스터리 로고'),
  s_logo_market: A('s_logo_market', 'logo-market.png', 900, 260, '성수 가을장터 로고'),
  s_logo_clean: A('s_logo_clean', 'logo-clean.png', 900, 260, '반짝 홈케어 로고'),
};

function pick(ids: string[]): Record<string, Asset> {
  return Object.fromEntries(ids.map((id) => [id, SAMPLE_ASSETS[id]]));
}

export function sampleMaterial(purpose: Purpose): MaterialInput {
  switch (purpose) {
    case 'product':
      return {
        purpose,
        brandName: '온기 로스터리',
        title: '매일 아침, 갓 볶은 커피 한 잔',
        subtitle: '동네 로스터리의 핸드드립 원두 세트',
        description:
          '주문 후 24시간 안에 로스팅: 가장 향이 좋은 때에 받아보세요.\n' +
          '세 가지 원두 샘플러: 산미, 고소함, 달콤함을 한 번에 비교할 수 있어요.\n' +
          '드립백도 함께: 도구가 없어도 뜨거운 물만 있으면 충분합니다.',
        highlight: '첫 주문 30% 할인\n9월 30일까지',
        ctaTitle: '오늘 볶은 원두를 만나보세요',
        ctaDetail: 'onggi-roastery.kr · 02-123-4567',
        ctaButton: '주문하기',
        imageIds: ['s_coffee_hero', 's_coffee_pour', 's_coffee_beans'],
        logoId: 's_logo_onggi',
        assets: pick(['s_coffee_hero', 's_coffee_pour', 's_coffee_beans', 's_logo_onggi']),
        colors: { primary: '#E0602F', accent: '#F5C04A' },
      };
    case 'event':
      return {
        purpose,
        brandName: '성수 가을장터',
        title: '성수 가을장터에 초대합니다',
        subtitle: '10월 12일(토) 11시 – 18시 · 성수 연무장길',
        description:
          '로컬 브랜드 40곳: 손으로 만든 소품과 먹거리를 한자리에서 만나요.\n' +
          '버스킹과 체험 부스: 아이와 함께 즐길 수 있는 프로그램이 가득합니다.',
        highlight: '입장 무료\n반려동물 동반 가능',
        ctaTitle: '가을 주말, 성수에서 만나요',
        ctaDetail: '인스타그램 @seongsu.market',
        ctaButton: '사전 신청',
        imageIds: ['s_market'],
        logoId: 's_logo_market',
        assets: pick(['s_market', 's_logo_market']),
        colors: { primary: '#2E7D5B', accent: '#F2A541' },
      };
    case 'service':
      return {
        purpose,
        brandName: '반짝 홈케어',
        title: '퇴근 후, 반짝이는 집으로',
        subtitle: '검증된 전문가의 정기 홈클리닝',
        description:
          '앱으로 1분 예약: 원하는 날짜와 시간만 고르면 끝.\n' +
          '꼼꼼한 체크리스트: 청소 전후 사진으로 결과를 확인하세요.',
        highlight: '첫 방문 1만원 할인',
        ctaTitle: '지금 첫 청소를 예약하세요',
        ctaDetail: 'banjjak.care · 1588-0000',
        ctaButton: '예약하기',
        imageIds: ['s_cleaning'],
        logoId: 's_logo_clean',
        assets: pick(['s_cleaning', 's_logo_clean']),
        colors: { primary: '#3A86FF', accent: '#FFBE0B' },
      };
  }
}

export function emptyMaterial(purpose: Purpose): MaterialInput {
  return {
    purpose,
    brandName: '',
    title: '',
    subtitle: '',
    description: '',
    highlight: '',
    ctaTitle: '',
    ctaDetail: '',
    ctaButton: '',
    imageIds: [],
    assets: {},
    colors: { primary: '#E0602F', accent: '#F5C04A' },
  };
}

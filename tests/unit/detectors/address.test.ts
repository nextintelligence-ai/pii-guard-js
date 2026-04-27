import { describe, expect, it } from 'vitest';
import { addressRule } from '@/core/detectors/address';

describe('addressRule', () => {
  it('도로명 주소 전체(시/도부터 번지까지)를 매치한다', () => {
    const r = addressRule.scan('서울특별시 강남구 테헤란로 123');
    expect(r).toHaveLength(1);
    expect(r[0]!.matched).toBe('서울특별시 강남구 테헤란로 123');
  });

  it('지번/아파트 표기(101동 202호)를 포함한 주소도 전체를 매치한다', () => {
    const r = addressRule.scan('회사 주소는 서울시 강남구 101동 202호 입니다');
    expect(r).toHaveLength(1);
    expect(r[0]!.matched).toBe('서울시 강남구 101동 202호');
  });

  it('시/도 + 시/군/구 만 있고 상세 주소가 없으면 후보를 만들지 않는다', () => {
    expect(addressRule.scan('서울시 강남구의 회사들이 많습니다').length).toBe(0);
    expect(addressRule.scan('서울시 강남구 사람들이 많이 산다').length).toBe(0);
  });

  it('한국어 단어 안에 포함된 시/도 키워드는 매칭하지 않는다', () => {
    expect(addressRule.scan('그서울시 강남구 테헤란로 123').length).toBe(0);
  });

  it('지방 광역단위(강원특별자치도/경기도)도 인식한다', () => {
    const r = addressRule.scan('강원특별자치도 춘천시 평화로 12');
    expect(r).toHaveLength(1);
    expect(r[0]!.matched).toBe('강원특별자치도 춘천시 평화로 12');
  });

  it('빌딩명/층까지 포함된 긴 주소를 인식한다', () => {
    const r = addressRule.scan('서울시 강남구 ABC빌딩 5층');
    expect(r).toHaveLength(1);
    expect(r[0]!.matched).toBe('서울시 강남구 ABC빌딩 5층');
  });

  it('주소 다음에 따라오는 일반 단어는 매치 범위에 포함되지 않는다', () => {
    // "사무실" 은 주소 토큰 패턴(동/읍/면/리/로/길/...) 어디에도 해당하지 않으므로 멈춘다.
    const r = addressRule.scan('서울시 강남구 테헤란로 123 사무실에서 근무');
    expect(r).toHaveLength(1);
    expect(r[0]!.matched).toBe('서울시 강남구 테헤란로 123');
  });

  it('한 줄에 두 개의 주소가 있으면 각각 검출한다', () => {
    const r = addressRule.scan('본사: 서울시 강남구 테헤란로 1, 지사: 부산시 해운대구 센텀로 2');
    expect(r).toHaveLength(2);
    expect(r[0]!.matched).toBe('서울시 강남구 테헤란로 1');
    expect(r[1]!.matched).toBe('부산시 해운대구 센텀로 2');
  });

  it('띄어쓰기 없이 붙어있는 주소(연속 토큰) + 콤마 + 괄호 보충정보까지 한 번에 검출한다', () => {
    const input = '경기남양주시와부읍덕소로213 ,106-701(도곡리, 덕소강변서희스타힐스)';
    const r = addressRule.scan(input);
    expect(r).toHaveLength(1);
    expect(r[0]!.matched).toBe(input);
  });

  it('짧은 시/도 형(서울/경기 등)도 시/군/구+상세 주소가 따라붙으면 검출한다', () => {
    const r = addressRule.scan('서울 강남구 1동');
    expect(r).toHaveLength(1);
    expect(r[0]!.matched).toBe('서울 강남구 1동');
  });

  it('"1번 출구" 처럼 한국어와 결합된 숫자 토큰은 false positive 가 되지 않는다', () => {
    expect(addressRule.scan('서울시 강남구 1번 출구로 나오세요').length).toBe(0);
  });
});

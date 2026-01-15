import streamlit as st
import sqlite3
import pandas as pd

# --- 데이터베이스 설정 ---
def init_db():
    conn = sqlite3.connect('assets_v3.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS pcs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_name TEXT,
            user_name TEXT,
            department TEXT,
            cpu TEXT,
            ram TEXT,
            status TEXT
        )
    ''')
    conn.commit()
    return conn

# --- 데이터 처리 함수 ---
def add_pc(model, user, dept, cpu, ram, status):
    conn = sqlite3.connect('assets_v3.db')
    c = conn.cursor()
    c.execute('''
        INSERT INTO pcs (model_name, user_name, department, cpu, ram, status) 
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (model, user, dept, cpu, ram, status))
    conn.commit()
    conn.close()

def delete_pc(pc_id):
    conn = sqlite3.connect('assets_v3.db')
    c = conn.cursor()
    c.execute('DELETE FROM pcs WHERE id = ?', (pc_id,))
    conn.commit()
    conn.close()

def get_all_pcs():
    conn = sqlite3.connect('assets_v3.db')
    df = pd.read_sql_query("SELECT * FROM pcs", conn)
    conn.close()
    return df

# --- UI 구성 ---
def main():
    st.set_page_config(page_title="사내 PC 관리 시스템 Pro", layout="wide")
    st.title("🖥️ 사내 PC 자산 관리 프로그램 v3")
    
    init_db()
    df = get_all_pcs()

    # --- 사이드바: 등록 및 삭제 ---
    with st.sidebar:
        st.header("➕ 신규 PC 등록")
        with st.form("registration_form"):
            model = st.text_input("모델명")
            user = st.text_input("사용자명")
            dept = st.selectbox("부서", ["개발팀", "인사팀", "영업팀", "디자인팀", "기획팀", "기타"])
            cpu = st.text_input("CPU (예: i7, M2)")
            ram = st.selectbox("RAM", ["8GB", "16GB", "32GB", "64GB"])
            status = st.radio("상태", ["정상", "수리중", "폐기예정"])
            if st.form_submit_button("등록하기"):
                if model and user:
                    add_pc(model, user, dept, cpu, ram, status)
                    st.success(f"{user}님 PC 등록 완료!")
                    st.rerun()

        if not df.empty:
            st.markdown("---")
            st.header("🗑️ 데이터 삭제")
            delete_id = st.selectbox("삭제할 ID 선택", df['id'].tolist())
            if st.button("선택한 PC 삭제", type="primary"):
                delete_pc(delete_id)
                st.warning(f"ID {delete_id} 삭제됨")
                st.rerun()

    # --- 메인 화면: 필터 및 통계 ---
    if not df.empty:
        # 1. 필터링 섹션
        st.subheader("🔍 데이터 검색 및 필터")
        col1, col2 = st.columns(2)
        with col1:
            search_user = st.text_input("사용자 이름으로 검색")
        with col2:
            filter_dept = st.multiselect("부서별 필터", options=df['department'].unique(), default=df['department'].unique())

        # 필터링 적용
        filtered_df = df[df['department'].isin(filter_dept)]
        if search_user:
            filtered_df = filtered_df[filtered_df['user_name'].str.contains(search_user)]

        # 2. 통계 및 차트 섹션
        st.divider()
        st.subheader("📊 부서별 보유 현황")
        dept_counts = filtered_df['department'].value_counts()
        st.bar_chart(dept_counts)

        # 3. 데이터 목록 섹션
        st.divider()
        st.subheader("📋 상세 자산 목록")
        st.dataframe(filtered_df, use_container_width=True, hide_index=True)

        # 4. 엑셀(CSV) 내보내기 버튼
        csv = filtered_df.to_csv(index=False).encode('utf-8-sig') # 한글 깨짐 방지 위해 utf-8-sig 사용
        st.download_button(
            label="📥 현재 목록 CSV로 다운로드",
            data=csv,
            file_name='pc_assets_export.csv',
            mime='text/csv',
        )
    else:
        st.info("등록된 데이터가 없습니다. 왼쪽 사이드바에서 등록을 시작해 주세요!")

if __name__ == "__main__":
    main()
document.addEventListener('DOMContentLoaded', () => {
    // !!! 중요: 배포된 자신의 Google Apps Script 웹 앱 URL로 변경하세요.
    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwPV62ZVt6TSRWCIo-BzWEKKbT_OIDB4PZ82dbCELB-JRDpqJ-VapcaVBxFmzm_AOch/exec'; // (URL은 그대로 둡니다)

    const recordForm = document.getElementById('record-form');
    const recordsContainer = document.getElementById('records-container');
    const exportButton = document.getElementById('export-excel');
    const activityChartCanvas = document.getElementById('activity-chart');
    const timeChartCanvas = document.getElementById('time-chart');
    
    // 2번 항목 '기타' 입력 필드 DOM 요소
    const outdoorEtcDetail = document.getElementById('outdoor-etc-detail');
    
    let recordsCache = []; // 데이터 캐싱
    let activityChart;
    let timeChart;
    
    // 이모지 매핑
    const satisfactionEmojis = { '매우 좋음': '🤩', '좋음': '😊', '보통': '😐', '별로': '😞' };
    const timeColors = ['#FFA07A', '#6495ED', '#90EE90', '#D3D3D3']; // 30분, 1~2시간, 6시간 이상, 기타

    // 2번 항목 '기타' 라디오 버튼 클릭 이벤트 처리
    const outdoorRadios = document.querySelectorAll('input[name="outdoor"]');
    outdoorRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (document.getElementById('outdoor-etc').checked) {
                outdoorEtcDetail.style.display = 'block';
            } else {
                outdoorEtcDetail.style.display = 'none';
                outdoorEtcDetail.value = ''; 
            }
        });
    });

    // 데이터 로드 및 화면 업데이트
    const loadRecords = async () => {
        try {
            const response = await fetch(WEB_APP_URL, { method: 'GET', redirect: 'follow' });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            recordsCache = await response.json();
            if (!Array.isArray(recordsCache)) {
                console.error("Error data received from Google Apps Script:", recordsCache);
                throw new Error('Google Apps Script에서 에러가 발생했습니다.');
            }
            
            recordsContainer.innerHTML = ''; 
            recordsCache.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
            
            recordsCache.forEach(addRecordToDOM);
            renderCharts();

        } catch (error) {
            console.error('Error loading records:', error);
            recordsContainer.innerHTML = `<p style="color: red;">데이터를 불러오는 데 실패했습니다. 설정을 확인하세요.</p>`;
        }
    };

    const addRecordToDOM = (record) => {
        const row = document.createElement('div');
        row.classList.add('record-row');
        
        const activities = (record.Activity || '').split(',').map(a => `<span class="activity-tag">${a.trim()}</span>`).join(' ');
        
        // '추천 대상'을 표시하는 <div> 추가
        row.innerHTML = `
            <div class="record-location">${record.Location || '-'}</div>
            <div class="record-outdoor">${record.Outdoor || '-'}</div>
            <div class="record-activity" title="${record.Activity}">${activities}</div>
            <div class="record-time">${record.Time || '-'}</div>
            <div class="record-mood">${record.Mood || '-'}</div>
            <div class="record-satisfaction" title="${record.Important}">${satisfactionEmojis[record.Satisfaction] || ''} ${record.Satisfaction} / ${record.Important}</div>
            <div class="record-recommend" title="${record.Recommend}">${record.Recommend || '-'}</div>
        `;
        recordsContainer.appendChild(row);
    };

    const renderCharts = () => {
        // --- 3. 활동 통계 (막대 그래프) ---
        const activityCounts = recordsCache.flatMap(r => (r.Activity || '').split(',').map(a => a.trim()))
                                            .filter(a => a)
                                            .reduce((acc, activity) => {
                                                acc[activity] = (acc[activity] || 0) + 1;
                                                return acc;
                                            }, {});

        const activityLabels = Object.keys(activityCounts);
        const activityData = Object.values(activityCounts);

        if (activityChart) activityChart.destroy();
        activityChart = new Chart(activityChartCanvas, {
            type: 'bar',
            data: {
                labels: activityLabels,
                datasets: [{
                    label: '휴식 활동 선호도 (총 응답)',
                    data: activityData,
                    backgroundColor: '#4CAF50',
                    borderColor: '#388E3C',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } }
            }
        });
        
        // --- 4. 시간대 통계 (파이 차트) ---
        const timeCounts = recordsCache.reduce((acc, record) => {
            acc[record.Time] = (acc[record.Time] || 0) + 1;
            return acc;
        }, {});
        
        const timeLabels = Object.keys(timeCounts);
        const timeValues = Object.values(timeCounts);

        if (timeChart) timeChart.destroy();
        timeChart = new Chart(timeChartCanvas, {
            type: 'pie',
            data: {
                labels: timeLabels,
                datasets: [{
                    label: '휴식 시간대 비율',
                    data: timeValues,
                    backgroundColor: timeColors,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top' } }
            }
        });
    };

    recordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = e.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = '저장 중...';

        const formData = new FormData(recordForm);
        
        // 3. 활동 항목 (다중 선택) 처리
        const activities = Array.from(document.querySelectorAll('input[name="activity"]:checked'))
                                .map(el => el.value)
                                .join(', '); 
        const activityEtc = formData.get('activity_etc');
        const finalActivities = (activities.includes('기타') && activityEtc) 
                                ? activities.replace('기타', `기타(${activityEtc})`) 
                                : activities;

        // 2. 야외 방문지 '기타' 항목 처리
        const outdoorValue = formData.get('outdoor');
        const outdoorEtc = formData.get('outdoor_etc'); 
        const finalOutdoor = (outdoorValue === '기타' && outdoorEtc) 
                                ? `기타(${outdoorEtc})` 
                                : outdoorValue;

        const data = {
            Location: formData.get('location'),
            Outdoor: finalOutdoor, 
            Activity: finalActivities, 
            Time: formData.get('time'),
            Mood: formData.get('mood'),
            Satisfaction: formData.get('satisfaction'),
            Important: formData.get('important'),
            Recommend: formData.get('recommend'), // 이미 포함되어 있음
            Memory: formData.get('memory')
        };

        try {
            const response = await fetch(WEB_APP_URL, {
                method: 'POST',
                mode: 'no-cors', 
                body: JSON.stringify(data)
            });

            alert('성공적으로 기록되었습니다! 감사합니다. 😊');
            recordForm.reset();
            outdoorEtcDetail.style.display = 'none';
            loadRecords(); 

        } catch (error) {
            console.error('Error submitting record:', error);
            alert('기록 저장에 실패했습니다. 인터넷 연결 및 스크립트 URL을 확인하세요.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = '나의 휴식 공간 기록';
        }
    });

    exportButton.addEventListener('click', () => {
        if (recordsCache.length === 0) {
            alert('내보낼 데이터가 없습니다.');
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(recordsCache);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "휴식공간기록");
        XLSX.writeFile(workbook, "my_relaxation_space_records.xlsx");
    });

    // 초기 데이터 로드
    loadRecords();
});
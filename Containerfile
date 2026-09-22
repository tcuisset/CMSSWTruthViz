FROM cmssw/el9:x86_64

WORKDIR /opt/app-root/src

COPY . /opt/app-root/src

RUN python3 -m pip install --no-cache-dir -r requirements.txt \
    && chmod +x .s2i/bin/run .s2i/bin/assemble visualizeTruthGraph \
    && mkdir -p data \
    && printf 'window.EMBEDDED_BUNDLE_DATA = null;\n' > app/js/bundle.js \
    && printf 'window.EMBEDDED_RECHITS_DATA = null;\n' > app/js/rechits.js \
    && chmod -R g=u /opt/app-root/src

ENV PYTHON_BIN=python3 \
    HOST=0.0.0.0 \
    PORT=8080 \
    VO_CMS_SW_DIR=/cvmfs/cms.cern.ch \
    CMSSET_DEFAULT=/cvmfs/cms.cern.ch/cmsset_default.sh \
    TRUTHVIZ_CMSSW_RELEASE=CMSSW_20_1_0_pre3 \
    TRUTHVIZ_SCRAM_ARCH=el9_amd64_gcc14 \
    TRUTHVIZ_CMSRUN_WRAPPER=

EXPOSE 8080

CMD ["/opt/app-root/src/.s2i/bin/run"]

# syntax=docker/dockerfile:1
FROM golang:1.27.1-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
ARG VERSION=1.0.3
ARG COMMIT=local
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" -o /out/kivronix-api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/kivronix-api /kivronix-api
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/kivronix-api"]
